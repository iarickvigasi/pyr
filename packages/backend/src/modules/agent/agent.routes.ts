import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  conversationContextParamsSchema,
  guestContextParamsSchema,
  conversationContextResponseSchema,
  guestContextResponseSchema,
  availabilitySummaryResponseSchema,
  upcomingEventsResponseSchema,
} from './agent.schema.js';
import {
  getConversationContext,
  getGuestContext,
  getAvailabilitySummary,
  getUpcomingEvents,
} from './agent.service.js';
import { errorResponseSchema } from '../../lib/error-response.schema.js';

export default async function agentRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.addHook('onRequest', app.authenticate);

  server.get('/conversation/:conversationId', {
    schema: {
      tags: ['Agent'],
      summary: 'Get full conversation context for AI draft generation',
      params: conversationContextParamsSchema,
      response: { 200: conversationContextResponseSchema, 404: errorResponseSchema },
    },
  }, async (request) => {
    const { conversationId } = request.params;
    const data = await getConversationContext(app.prisma, conversationId);
    return { data };
  });

  server.get('/guest/:guestId', {
    schema: {
      tags: ['Agent'],
      summary: 'Get guest CRM profile with booking and conversation history',
      params: guestContextParamsSchema,
      response: { 200: guestContextResponseSchema, 404: errorResponseSchema },
    },
  }, async (request) => {
    const { guestId } = request.params;
    const data = await getGuestContext(app.prisma, guestId);
    return { data };
  });

  server.get('/availability', {
    schema: {
      tags: ['Agent'],
      summary: 'Get room availability summary for the next 90 days',
      response: { 200: availabilitySummaryResponseSchema },
    },
  }, async () => {
    const data = await getAvailabilitySummary(app.prisma);
    return { data };
  });

  server.get('/events', {
    schema: {
      tags: ['Agent'],
      summary: 'Get upcoming events with capacity for the next 30 days',
      response: { 200: upcomingEventsResponseSchema },
    },
  }, async () => {
    const data = await getUpcomingEvents(app.prisma);
    return { data };
  });
}
