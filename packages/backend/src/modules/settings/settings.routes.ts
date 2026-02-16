import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  settingKeyParamSchema,
  upsertSettingBodySchema,
  settingResponseSchema,
  settingsListResponseSchema,
} from './settings.schema.js';
import { listSettings, getSetting, upsertSetting } from './settings.service.js';

export default async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.addHook('onRequest', app.authenticate);

  server.get('/', {
    schema: {
      tags: ['Settings'],
      summary: 'List all settings',
      response: { 200: settingsListResponseSchema },
    },
  }, async () => {
    const settings = await listSettings(app.prisma);
    return { data: settings };
  });

  server.get('/:key', {
    schema: {
      tags: ['Settings'],
      summary: 'Get a single setting by key',
      params: settingKeyParamSchema,
      response: { 200: settingResponseSchema },
    },
  }, async (request) => {
    const { key } = request.params as { key: string };
    const setting = await getSetting(app.prisma, key);
    return { data: setting };
  });

  server.put('/:key', {
    schema: {
      tags: ['Settings'],
      summary: 'Create or update a setting',
      params: settingKeyParamSchema,
      body: upsertSettingBodySchema,
      response: { 200: settingResponseSchema },
    },
  }, async (request) => {
    const { key } = request.params as { key: string };
    const { value } = request.body as { value: unknown };
    const setting = await upsertSetting(
      app.prisma,
      key,
      value,
      request.user.sub,
    );
    return { data: setting };
  });
}
