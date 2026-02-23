import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

export default fp(async function swaggerPlugin(fastify: FastifyInstance) {
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Puppy Yoga Retreat API',
        description: 'REST API for the PYR business automation platform',
        version: '1.0.0',
      },
      servers: fastify.config.NODE_ENV === 'production'
        ? []
        : [
            {
              url: `http://localhost:${fastify.config.PORT}`,
              description: 'Development server',
            },
          ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
        },
      },
      tags: [
        { name: 'Auth', description: 'Authentication -- JWT login and session management' },
        { name: 'Guests', description: 'Guest CRM -- profiles, search, merge, soft-delete' },
        { name: 'Bookings', description: 'Booking management -- CRUD with availability checks and status machine' },
        { name: 'Events', description: 'Standalone events -- yoga classes, beach walks, registrations' },
        { name: 'Room Types', description: 'Room type definitions with base pricing' },
        { name: 'Rooms', description: 'Physical room instances with status tracking' },
        { name: 'Seasons', description: 'Seasonal pricing periods with overlap detection' },
        { name: 'Availability', description: 'Room availability engine for date range queries' },
        { name: 'Inbox', description: 'Unified inbox -- conversations, messages, AI drafts, email sending' },
        { name: 'Dashboard', description: 'KPI stats and today view -- check-ins, check-outs, events' },
        { name: 'Settings', description: 'Application settings -- email provider, CalDAV, signature, polling' },
        { name: 'FAQ', description: 'FAQ management -- question/answer pairs injected into AI context' },
        { name: 'Agent', description: 'AI agent context endpoints -- conversation, guest, availability, events' },
        { name: 'Calendar', description: 'CalDAV calendar sync -- configuration, status, manual re-sync' },
        { name: 'Assistant', description: 'AI assistant chat -- SSE streaming proxy to OpenClaw Gateway' },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
  });
});
