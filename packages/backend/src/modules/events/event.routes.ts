import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { idParamSchema } from '@pyr/shared';
import {
  createEventSchema,
  updateEventSchema,
  listEventsQuerySchema,
  registerGuestSchema,
} from './event.schema.js';
import {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  registerGuest,
  listRegistrations,
} from './event.service.js';

export default async function eventRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.addHook('onRequest', app.authenticate);

  server.get('/', {
    schema: { tags: ['Events'], summary: 'List events with type and date filters', querystring: listEventsQuerySchema },
  }, async (request) => {
    return listEvents(app.prisma, request.query);
  });

  server.get('/:id', {
    schema: { tags: ['Events'], summary: 'Get event detail with registrations', params: idParamSchema },
  }, async (request) => {
    return { data: await getEvent(app.prisma, request.params.id) };
  });

  server.post('/', {
    schema: { tags: ['Events'], summary: 'Create a new event', body: createEventSchema },
  }, async (request, reply) => {
    const event = await createEvent(app.prisma, request.body, request.user?.sub);
    return reply.status(201).send({ data: event });
  });

  server.patch('/:id', {
    schema: { tags: ['Events'], summary: 'Update event fields', params: idParamSchema, body: updateEventSchema },
  }, async (request) => {
    const event = await updateEvent(app.prisma, request.params.id, request.body, request.user?.sub);
    return { data: event };
  });

  server.delete('/:id', {
    schema: { tags: ['Events'], summary: 'Delete event and its registrations', params: idParamSchema },
  }, async (request, reply) => {
    await deleteEvent(app.prisma, request.params.id, request.user?.sub);
    return reply.status(204).send();
  });

  server.post('/:id/book', {
    schema: { tags: ['Events'], summary: 'Register guest for event (auto-waitlist at capacity)', params: idParamSchema, body: registerGuestSchema },
  }, async (request, reply) => {
    const registration = await registerGuest(
      app.prisma,
      request.params.id,
      request.body.guestId,
      request.user?.sub,
    );
    return reply.status(201).send({ data: registration });
  });

  server.get('/:id/registrations', {
    schema: { tags: ['Events'], summary: 'List event registrations with guest info', params: idParamSchema },
  }, async (request) => {
    return { data: await listRegistrations(app.prisma, request.params.id) };
  });
}
