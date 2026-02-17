import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { idParamSchema } from '@pyr/shared';
import {
  createRoomTypeSchema,
  updateRoomTypeSchema,
  createRoomSchema,
  updateRoomSchema,
  createSeasonSchema,
  updateSeasonSchema,
  availabilityQuerySchema,
} from './room.schema.js';
import {
  listRoomTypes,
  createRoomType,
  updateRoomType,
  listRooms,
  createRoom,
  updateRoom,
  listSeasons,
  createSeason,
  updateSeason,
  checkAvailability,
} from './room.service.js';

export default async function roomRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.addHook('onRequest', app.authenticate);

  // Room Types
  server.get('/room-types', {
    schema: { tags: ['Room Types'], summary: 'List all room types with their rooms' },
  }, async () => {
    return { data: await listRoomTypes(app.prisma) };
  });

  server.post('/room-types', {
    schema: { tags: ['Room Types'], summary: 'Create a room type', body: createRoomTypeSchema },
  }, async (request, reply) => {
    const roomType = await createRoomType(app.prisma, request.body, request.user?.sub);
    return reply.status(201).send({ data: roomType });
  });

  server.patch('/room-types/:id', {
    schema: { tags: ['Room Types'], summary: 'Update a room type', params: idParamSchema, body: updateRoomTypeSchema },
  }, async (request) => {
    const roomType = await updateRoomType(app.prisma, request.params.id, request.body, request.user?.sub);
    return { data: roomType };
  });

  // Rooms
  server.get('/rooms', {
    schema: { tags: ['Rooms'], summary: 'List all rooms with room type info' },
  }, async () => {
    return { data: await listRooms(app.prisma) };
  });

  server.post('/rooms', {
    schema: { tags: ['Rooms'], summary: 'Create a room', body: createRoomSchema },
  }, async (request, reply) => {
    const room = await createRoom(app.prisma, request.body, request.user?.sub);
    return reply.status(201).send({ data: room });
  });

  server.patch('/rooms/:id', {
    schema: { tags: ['Rooms'], summary: 'Update room name or status', params: idParamSchema, body: updateRoomSchema },
  }, async (request) => {
    const room = await updateRoom(app.prisma, request.params.id, request.body, request.user?.sub);
    return { data: room };
  });

  // Seasons
  server.get('/seasons', {
    schema: { tags: ['Seasons'], summary: 'List all pricing seasons' },
  }, async () => {
    return { data: await listSeasons(app.prisma) };
  });

  server.post('/seasons', {
    schema: { tags: ['Seasons'], summary: 'Create a pricing season', body: createSeasonSchema },
  }, async (request, reply) => {
    const season = await createSeason(app.prisma, request.body, request.user?.sub);
    return reply.status(201).send({ data: season });
  });

  server.patch('/seasons/:id', {
    schema: { tags: ['Seasons'], summary: 'Update a pricing season', params: idParamSchema, body: updateSeasonSchema },
  }, async (request) => {
    const season = await updateSeason(app.prisma, request.params.id, request.body, request.user?.sub);
    return { data: season };
  });

  // Availability
  server.get('/availability', {
    schema: { tags: ['Availability'], summary: 'Check room availability for date range', querystring: availabilityQuerySchema },
  }, async (request) => {
    const rooms = await checkAvailability(app.prisma, request.query);
    return {
      data: rooms.map((r) => ({
        roomId: r.room.id,
        roomName: r.room.name,
        roomTypeName: r.roomType.name,
        totalPrice: r.totalPrice,
        nightlyBreakdown: [] as { date: string; price: number }[],
      })),
    };
  });
}
