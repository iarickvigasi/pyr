import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { idParamSchema } from '@pyr/shared';
import {
  createRoomTypeSchema,
  updateRoomTypeSchema,
  createRoomSchema,
  updateRoomSchema,
  listRoomExternalMappingsQuerySchema,
  createRoomExternalMappingSchema,
  updateRoomExternalMappingSchema,
  createSeasonSchema,
  updateSeasonSchema,
  availabilityQuerySchema,
} from './room.schema.js';
import {
  listRoomTypes,
  createRoomType,
  updateRoomType,
  deleteRoomType,
  listRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  listRoomExternalMappings,
  createRoomExternalMapping,
  updateRoomExternalMapping,
  deleteRoomExternalMapping,
  importRoomsFromMotopress,
  listSeasons,
  createSeason,
  updateSeason,
  checkAvailability,
} from './room.service.js';
import { createMotopressClientFromEnv } from '../../services/motopress/index.js';

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

  server.delete('/room-types/:id', {
    schema: { tags: ['Room Types'], summary: 'Delete a room type', params: idParamSchema },
  }, async (request, reply) => {
    await deleteRoomType(app.prisma, request.params.id, request.user?.sub);
    return reply.status(204).send();
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

  server.delete('/rooms/:id', {
    schema: { tags: ['Rooms'], summary: 'Delete a room', params: idParamSchema },
  }, async (request, reply) => {
    await deleteRoom(app.prisma, request.params.id, request.user?.sub);
    return reply.status(204).send();
  });

  // External Room Mappings
  server.get('/room-mappings', {
    schema: { tags: ['Rooms'], summary: 'List external room mappings', querystring: listRoomExternalMappingsQuerySchema },
  }, async (request) => {
    return { data: await listRoomExternalMappings(app.prisma, request.query) };
  });

  server.post('/room-mappings', {
    schema: { tags: ['Rooms'], summary: 'Create external room mapping', body: createRoomExternalMappingSchema },
  }, async (request, reply) => {
    const mapping = await createRoomExternalMapping(app.prisma, request.body, request.user?.sub);
    return reply.status(201).send({ data: mapping });
  });

  server.patch('/room-mappings/:id', {
    schema: { tags: ['Rooms'], summary: 'Update external room mapping', params: idParamSchema, body: updateRoomExternalMappingSchema },
  }, async (request) => {
    const mapping = await updateRoomExternalMapping(app.prisma, request.params.id, request.body, request.user?.sub);
    return { data: mapping };
  });

  server.delete('/room-mappings/:id', {
    schema: { tags: ['Rooms'], summary: 'Delete external room mapping', params: idParamSchema },
  }, async (request, reply) => {
    await deleteRoomExternalMapping(app.prisma, request.params.id, request.user?.sub);
    return reply.status(204).send();
  });

  server.get('/room-mappings/motopress/accommodations', {
    schema: { tags: ['Rooms'], summary: 'List MotoPress accommodations for mapping' },
  }, async () => {
    const client = createMotopressClientFromEnv(app.config);
    const accommodations = await client.listAccommodations({
      page: 1,
      per_page: 100,
      context: 'view',
    });
    return {
      data: accommodations.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        accommodationTypeId: item.accommodation_type_id ?? null,
      })),
    };
  });

  server.post('/room-mappings/motopress/import', {
    schema: { tags: ['Rooms'], summary: 'Import room types and rooms from MotoPress' },
  }, async (request) => {
    const result = await importRoomsFromMotopress(app.prisma, app.config, request.user?.sub);
    return { data: result };
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
        room: r.room,
        roomTypeName: r.roomType.name,
        roomType: r.roomType,
        nights: r.nights,
        pricePerNight: r.pricePerNight,
        totalPrice: r.totalPrice,
        seasonMultiplier: r.seasonMultiplier,
        nightlyBreakdown: [] as { date: string; price: number }[],
      })),
    };
  });
}
