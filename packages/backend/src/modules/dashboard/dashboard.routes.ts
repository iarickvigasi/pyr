import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  dashboardStatsResponseSchema,
  dashboardTodayResponseSchema,
} from './dashboard.schema.js';
import { getStats, getToday } from './dashboard.service.js';
import { errorResponseSchema } from '../../lib/error-response.schema.js';

export default async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.addHook('onRequest', app.authenticate);

  server.get('/stats', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get dashboard KPIs (bookings count, revenue, pending inquiries)',
      response: { 200: dashboardStatsResponseSchema, 400: errorResponseSchema },
    },
  }, async () => {
    const stats = await getStats(app.prisma);
    return { data: stats };
  });

  server.get('/today', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get today\'s check-ins, check-outs, and events',
      response: { 200: dashboardTodayResponseSchema, 400: errorResponseSchema },
    },
  }, async () => {
    const today = await getToday(app.prisma);
    return { data: today };
  });
}
