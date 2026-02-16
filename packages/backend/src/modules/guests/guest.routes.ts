import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { idParamSchema } from '@pyr/shared';
import {
  createGuestSchema,
  updateGuestSchema,
  listGuestsQuerySchema,
  mergeGuestsSchema,
} from './guest.schema.js';
import {
  listGuests,
  getGuest,
  createGuest,
  updateGuest,
  deleteGuest,
  mergeGuests,
} from './guest.service.js';

export default async function guestRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // All routes require authentication
  server.addHook('onRequest', app.authenticate);

  server.get('/', {
    schema: { tags: ['Guests'], summary: 'List guests with search, tag, and source filters', querystring: listGuestsQuerySchema },
  }, async (request) => {
    return listGuests(app.prisma, request.query);
  });

  server.get('/:id', {
    schema: { tags: ['Guests'], summary: 'Get guest detail with booking/conversation counts', params: idParamSchema },
  }, async (request) => {
    return { data: await getGuest(app.prisma, request.params.id) };
  });

  server.post('/', {
    schema: { tags: ['Guests'], summary: 'Create a new guest', body: createGuestSchema },
  }, async (request, reply) => {
    const guest = await createGuest(app.prisma, request.body, request.user?.sub);
    return reply.status(201).send({ data: guest });
  });

  server.patch('/:id', {
    schema: { tags: ['Guests'], summary: 'Update guest fields', params: idParamSchema, body: updateGuestSchema },
  }, async (request) => {
    const guest = await updateGuest(app.prisma, request.params.id, request.body, request.user?.sub);
    return { data: guest };
  });

  server.delete('/:id', {
    schema: { tags: ['Guests'], summary: 'Soft-delete a guest', params: idParamSchema },
  }, async (request, reply) => {
    await deleteGuest(app.prisma, request.params.id, request.user?.sub);
    return reply.status(204).send();
  });

  server.post('/merge', {
    schema: { tags: ['Guests'], summary: 'Merge two guest records (secondary into primary)', body: mergeGuestsSchema },
  }, async (request) => {
    const guest = await mergeGuests(
      app.prisma,
      request.body.primaryId,
      request.body.secondaryId,
      request.user?.sub,
    );
    return { data: guest };
  });
}
