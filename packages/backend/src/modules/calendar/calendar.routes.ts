/**
 * Calendar sync routes -- CalDAV configuration, sync status, and manual re-sync.
 *
 * Business rule: Data flows ONE WAY -- DB -> Apple Calendar. Never read from
 * CalDAV to update DB. These routes let Ines configure CalDAV credentials,
 * test the connection, view sync health, and trigger manual re-syncs.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  syncStatusResponseSchema,
  resyncResponseSchema,
  caldavConfigResponseSchema,
  caldavConfigBodySchema,
  caldavConfigSavedResponseSchema,
  testCaldavConnectionResponseSchema,
} from './calendar.schema.js';
import {
  getSyncStatus,
  resyncAll,
  getCaldavConfigForUi,
  saveCaldavConfig,
  testCaldavConnection,
} from './calendar.service.js';
import { getActor } from '../../lib/audit.js';
import { errorResponseSchema } from '../../lib/error-response.schema.js';

export default async function calendarRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.addHook('onRequest', app.authenticate);

  // GET /status -- sync health counts
  server.get('/status', {
    schema: {
      tags: ['Calendar'],
      summary: 'Get calendar sync status (synced, pending, failed counts)',
      response: { 200: syncStatusResponseSchema },
    },
  }, async () => {
    const status = await getSyncStatus(app.prisma);
    return { data: status };
  });

  // POST /sync -- trigger full re-sync
  server.post('/sync', {
    schema: {
      tags: ['Calendar'],
      summary: 'Trigger manual re-sync of all bookings and events to CalDAV',
      response: { 200: resyncResponseSchema },
    },
  }, async () => {
    const result = await resyncAll(app.prisma, app.queues);
    return { data: result };
  });

  // GET /config -- CalDAV configuration (password masked)
  server.get('/config', {
    schema: {
      tags: ['Calendar'],
      summary: 'Get CalDAV provider configuration (password masked)',
      response: { 200: caldavConfigResponseSchema },
    },
  }, async () => {
    const config = await getCaldavConfigForUi(app.prisma);
    return { data: config };
  });

  // POST /config -- Save CalDAV configuration
  server.post('/config', {
    schema: {
      tags: ['Calendar'],
      summary: 'Save CalDAV provider configuration (encrypted)',
      body: caldavConfigBodySchema,
      response: { 200: caldavConfigSavedResponseSchema, 400: errorResponseSchema },
    },
  }, async (request) => {
    const body = request.body as {
      serverUrl: string;
      username: string;
      password: string;
      calendarName: string;
    };
    const actor = getActor(request.user?.sub);
    await saveCaldavConfig(app.prisma, body, actor);
    return { data: { saved: true } };
  });

  // POST /test-connection -- Test CalDAV connection
  server.post('/test-connection', {
    schema: {
      tags: ['Calendar'],
      summary: 'Test CalDAV connection with current credentials',
      response: { 200: testCaldavConnectionResponseSchema },
    },
  }, async () => {
    const result = await testCaldavConnection(app.prisma);
    return { data: result };
  });
}
