import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, cleanDatabase, getAuthToken } from '../../test/setup.js';
import { createTestRoomType, createTestRoom, createTestGuest } from '../../test/factories.js';

describe('Rooms API', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await getTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    token = await getAuthToken(app);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const headers = () => ({ authorization: `Bearer ${token}` });

  describe('Room Types', () => {
    it('should create and list room types', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/room-types', headers: headers(),
        payload: { name: 'Standard', basePrice: 10000, maxOccupancy: 2 },
      });
      expect(createRes.statusCode).toBe(201);

      const listRes = await app.inject({
        method: 'GET', url: '/api/v1/room-types', headers: headers(),
      });
      const body = JSON.parse(listRes.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('Standard');
    });

    it('should update room type', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/room-types', headers: headers(),
        payload: { name: 'Standard', basePrice: 10000, maxOccupancy: 2 },
      });
      const id = JSON.parse(createRes.body).data.id;

      const res = await app.inject({
        method: 'PATCH', url: `/api/v1/room-types/${id}`, headers: headers(),
        payload: { basePrice: 12000 },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.basePrice).toBe(12000);
    });

    it('should delete room type when unused', async () => {
      const roomType = await createTestRoomType(app, token, { name: 'Delete Type' });

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/room-types/${roomType.id}`,
        headers: headers(),
      });
      expect(deleteRes.statusCode).toBe(204);

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/room-types',
        headers: headers(),
      });
      expect(JSON.parse(listRes.body).data).toHaveLength(0);
    });

    it('should return conflict when deleting room type that still has rooms', async () => {
      const roomType = await createTestRoomType(app, token, { name: 'Type In Use' });
      await createTestRoom(app, token, roomType.id, { name: 'Type In Use Room' });

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/room-types/${roomType.id}`,
        headers: headers(),
      });
      expect(deleteRes.statusCode).toBe(409);
    });
  });

  describe('Rooms', () => {
    it('should create and list rooms', async () => {
      const rtRes = await app.inject({
        method: 'POST', url: '/api/v1/room-types', headers: headers(),
        payload: { name: 'Standard', basePrice: 10000, maxOccupancy: 2 },
      });
      const roomTypeId = JSON.parse(rtRes.body).data.id;

      await app.inject({
        method: 'POST', url: '/api/v1/rooms', headers: headers(),
        payload: { roomTypeId, name: 'Room 101' },
      });

      const res = await app.inject({
        method: 'GET', url: '/api/v1/rooms', headers: headers(),
      });
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('Room 101');
      expect(body.data[0].roomType).toBeDefined();
    });

    it('should delete room when it has no bookings', async () => {
      const roomType = await createTestRoomType(app, token, { name: 'Delete Room Type' });
      const room = await createTestRoom(app, token, roomType.id, { name: 'Delete Me Room' });

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/rooms/${room.id}`,
        headers: headers(),
      });
      expect(deleteRes.statusCode).toBe(204);

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/rooms',
        headers: headers(),
      });
      expect(JSON.parse(listRes.body).data).toHaveLength(0);
    });

    it('should return conflict when deleting room with booking history', async () => {
      const roomType = await createTestRoomType(app, token, { name: 'Booked Room Type' });
      const room = await createTestRoom(app, token, roomType.id, { name: 'Booked Room' });
      const guest = await createTestGuest(app, token);

      const bookingRes = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: headers(),
        payload: {
          guestId: guest.id,
          roomId: room.id,
          checkIn: '2026-04-10',
          checkOut: '2026-04-15',
          totalPrice: 50000,
        },
      });
      expect(bookingRes.statusCode).toBe(201);

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/rooms/${room.id}`,
        headers: headers(),
      });
      expect(deleteRes.statusCode).toBe(409);
    });

    it('should allow deleting room after booking is cancelled', async () => {
      const roomType = await createTestRoomType(app, token, { name: 'Cancelled Booking Type' });
      const room = await createTestRoom(app, token, roomType.id, { name: 'Room To Delete After Cancel' });
      const guest = await createTestGuest(app, token);

      const bookingRes = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: headers(),
        payload: {
          guestId: guest.id,
          roomId: room.id,
          checkIn: '2026-04-20',
          checkOut: '2026-04-23',
          totalPrice: 30000,
        },
      });
      expect(bookingRes.statusCode).toBe(201);
      const bookingId = JSON.parse(bookingRes.body).data.id as string;

      const cancelRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/bookings/${bookingId}`,
        headers: headers(),
      });
      expect(cancelRes.statusCode).toBe(204);

      const deleteRoomRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/rooms/${room.id}`,
        headers: headers(),
      });
      expect(deleteRoomRes.statusCode).toBe(204);
    });

    it('should allow deleting room after booking is cancelled via status PATCH', async () => {
      const roomType = await createTestRoomType(app, token, { name: 'Cancelled Via Patch Type' });
      const room = await createTestRoom(app, token, roomType.id, { name: 'Room To Delete After Patch Cancel' });
      const guest = await createTestGuest(app, token);

      const bookingRes = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: headers(),
        payload: {
          guestId: guest.id,
          roomId: room.id,
          checkIn: '2026-04-24',
          checkOut: '2026-04-26',
          totalPrice: 20000,
        },
      });
      expect(bookingRes.statusCode).toBe(201);
      const bookingId = JSON.parse(bookingRes.body).data.id as string;

      const cancelViaPatchRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/bookings/${bookingId}`,
        headers: headers(),
        payload: { status: 'cancelled' },
      });
      expect(cancelViaPatchRes.statusCode).toBe(200);

      const deleteRoomRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/rooms/${room.id}`,
        headers: headers(),
      });
      expect(deleteRoomRes.statusCode).toBe(204);
    });

    it('should delete booking-linked calendar events before purging archived bookings', async () => {
      const roomType = await createTestRoomType(app, token, { name: 'Calendar Cleanup Type' });
      const room = await createTestRoom(app, token, roomType.id, { name: 'Room With Calendar Link' });
      const guest = await createTestGuest(app, token);

      const bookingRes = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: headers(),
        payload: {
          guestId: guest.id,
          roomId: room.id,
          checkIn: '2026-04-27',
          checkOut: '2026-04-29',
          totalPrice: 21000,
        },
      });
      expect(bookingRes.statusCode).toBe(201);
      const bookingId = JSON.parse(bookingRes.body).data.id as string;

      await app.prisma.calendarEvent.create({
        data: {
          bookingId,
          syncStatus: 'failed',
          lastError: 'test row',
        },
      });

      const cancelViaPatchRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/bookings/${bookingId}`,
        headers: headers(),
        payload: { status: 'cancelled' },
      });
      expect(cancelViaPatchRes.statusCode).toBe(200);

      const deleteRoomRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/rooms/${room.id}`,
        headers: headers(),
      });
      expect(deleteRoomRes.statusCode).toBe(204);

      const calendarRows = await app.prisma.calendarEvent.findMany({
        where: { bookingId },
      });
      expect(calendarRows).toHaveLength(0);
    });
  });

  describe('External Room Mappings', () => {
    it('should create, list, and update room external mappings', async () => {
      const roomType = await createTestRoomType(app, token, { name: 'Mapping Type' });
      const room = await createTestRoom(app, token, roomType.id, { name: 'Mapping Room' });

      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/room-mappings', headers: headers(),
        payload: {
          roomId: room.id,
          provider: 'MotoPress',
          externalAccommodationId: '243',
          externalAccommodationTypeId: '12',
          defaultAdults: 2,
          defaultChildren: 0,
        },
      });
      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.body).data;
      expect(created.provider).toBe('motopress');

      const listRes = await app.inject({
        method: 'GET', url: '/api/v1/room-mappings?provider=motopress', headers: headers(),
      });
      expect(listRes.statusCode).toBe(200);
      const listBody = JSON.parse(listRes.body);
      expect(listBody.data).toHaveLength(1);
      expect(listBody.data[0].room.id).toBe(room.id);

      const updateRes = await app.inject({
        method: 'PATCH', url: `/api/v1/room-mappings/${created.id}`, headers: headers(),
        payload: {
          externalAccommodationId: '244',
          defaultChildren: 1,
        },
      });
      expect(updateRes.statusCode).toBe(200);
      const updated = JSON.parse(updateRes.body).data;
      expect(updated.externalAccommodationId).toBe('244');
      expect(updated.defaultChildren).toBe(1);
    });

    it('should return conflict on duplicate provider/accommodation mapping', async () => {
      const roomType = await createTestRoomType(app, token, { name: 'Duplicate Mapping Type' });
      const roomA = await createTestRoom(app, token, roomType.id, { name: 'Room A Map' });
      const roomB = await createTestRoom(app, token, roomType.id, { name: 'Room B Map' });

      await app.inject({
        method: 'POST', url: '/api/v1/room-mappings', headers: headers(),
        payload: {
          roomId: roomA.id,
          provider: 'motopress',
          externalAccommodationId: '500',
        },
      });

      const duplicateRes = await app.inject({
        method: 'POST', url: '/api/v1/room-mappings', headers: headers(),
        payload: {
          roomId: roomB.id,
          provider: 'motopress',
          externalAccommodationId: '500',
        },
      });
      expect(duplicateRes.statusCode).toBe(409);
    });

    it('should list MotoPress accommodations for mapping', async () => {
      app.config.MOTOPRESS_ENABLED = true;
      app.config.MOTOPRESS_BASE_URL = 'https://example.com/wp-json/mphb/v1';
      app.config.MOTOPRESS_CONSUMER_KEY = 'ck_test';
      app.config.MOTOPRESS_CONSUMER_SECRET = 'cs_test';
      app.config.MOTOPRESS_TIMEOUT_MS = 5000;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify([
          {
            id: 1913,
            status: 'publish',
            accommodation_type_id: 1807,
            title: 'Sea View Shared Room',
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/room-mappings/motopress/accommodations',
        headers: headers(),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(1913);
      expect(body.data[0].title).toBe('Sea View Shared Room');
      expect(body.data[0].accommodationTypeId).toBe(1807);
    });

    it('should import room types and rooms from MotoPress', async () => {
      app.config.MOTOPRESS_ENABLED = true;
      app.config.MOTOPRESS_BASE_URL = 'https://example.com/wp-json/mphb/v1';
      app.config.MOTOPRESS_CONSUMER_KEY = 'ck_test';
      app.config.MOTOPRESS_CONSUMER_SECRET = 'cs_test';
      app.config.MOTOPRESS_TIMEOUT_MS = 5000;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: string | URL | Request) => {
        const asString = typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
        if (asString.includes('/accommodation_types')) {
          return new Response(JSON.stringify([
            {
              id: 1850,
              status: 'publish',
              title: 'Standard Double',
              description: 'Standard room type',
              adults: 2,
              children: 0,
              total_capacity: 2,
              base_adults: 2,
              base_children: 0,
            },
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (asString.includes('/accommodations')) {
          return new Response(JSON.stringify([
            {
              id: 1913,
              status: 'publish',
              accommodation_type_id: 1850,
              title: 'Standard Double 1',
            },
            {
              id: 1914,
              status: 'publish',
              accommodation_type_id: 1850,
              title: 'Standard Double 2',
            },
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
      });

      const importRes = await app.inject({
        method: 'POST',
        url: '/api/v1/room-mappings/motopress/import',
        headers: headers(),
      });

      expect(importRes.statusCode).toBe(200);
      const importBody = JSON.parse(importRes.body);
      expect(importBody.data.roomTypes.created).toBe(1);
      expect(importBody.data.rooms.created).toBe(2);
      expect(importBody.data.mappings.created).toBe(2);

      const roomTypesRes = await app.inject({
        method: 'GET',
        url: '/api/v1/room-types',
        headers: headers(),
      });
      const roomTypesBody = JSON.parse(roomTypesRes.body);
      expect(roomTypesBody.data.some((t: { name: string }) => t.name === 'Standard Double')).toBe(true);

      const roomsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/rooms',
        headers: headers(),
      });
      const roomsBody = JSON.parse(roomsRes.body);
      expect(roomsBody.data.some((room: { name: string }) => room.name === 'Standard Double 1')).toBe(true);
      expect(roomsBody.data.some((room: { name: string }) => room.name === 'Standard Double 2')).toBe(true);

      const mappingsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/room-mappings?provider=motopress',
        headers: headers(),
      });
      const mappingsBody = JSON.parse(mappingsRes.body);
      expect(mappingsBody.data).toHaveLength(2);
      expect(mappingsBody.data[0].externalAccommodationTypeId).toBe('1850');
    });

    it('should delete room mapping', async () => {
      const roomType = await createTestRoomType(app, token, { name: 'Delete Mapping Type' });
      const room = await createTestRoom(app, token, roomType.id, { name: 'Delete Mapping Room' });

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/room-mappings',
        headers: headers(),
        payload: {
          roomId: room.id,
          provider: 'motopress',
          externalAccommodationId: '901',
        },
      });
      expect(createRes.statusCode).toBe(201);
      const mappingId = JSON.parse(createRes.body).data.id;

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/room-mappings/${mappingId}`,
        headers: headers(),
      });
      expect(deleteRes.statusCode).toBe(204);

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/room-mappings?provider=motopress',
        headers: headers(),
      });
      expect(JSON.parse(listRes.body).data).toHaveLength(0);
    });
  });

  describe('Seasons', () => {
    it('should create and list seasons', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/seasons', headers: headers(),
        payload: { name: 'Summer', startDate: '2026-06-01', endDate: '2026-09-30', priceMultiplier: 1.5 },
      });
      expect(createRes.statusCode).toBe(201);

      const res = await app.inject({
        method: 'GET', url: '/api/v1/seasons', headers: headers(),
      });
      expect(JSON.parse(res.body).data).toHaveLength(1);
    });

    it('should reject invalid date range', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/seasons', headers: headers(),
        payload: { name: 'Bad', startDate: '2026-09-30', endDate: '2026-06-01', priceMultiplier: 1.0 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Availability — overlap boundary conditions', () => {
    // These tests cover the lt/gt boundary in the overlap query:
    //   checkIn: { lt: checkOut }, checkOut: { gt: checkIn }
    // which means [A, B) overlaps [C, D) iff A < D && B > C.
    // Adjacent bookings (check-out = next check-in) must NOT block availability.

    it('should block availability when dates overlap (middle of existing booking)', async () => {
      const rt = await createTestRoomType(app, token, { name: 'Overlap Test Type' });
      const room = await createTestRoom(app, token, rt.id, { name: 'Overlap Room' });
      const guest = await createTestGuest(app, token);

      // Book Apr 1–5
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId: guest.id, roomId: room.id, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      // Check Apr 3–7 (overlaps)
      const res = await app.inject({
        method: 'GET', url: '/api/v1/availability?checkIn=2026-04-03&checkOut=2026-04-07', headers: headers(),
      });
      const names = JSON.parse(res.body).data.map((r: Record<string, unknown>) => (r.room as Record<string, unknown>).name);
      expect(names).not.toContain('Overlap Room');
    });

    it('should allow booking when check-in equals prior booking check-out (adjacent, no gap)', async () => {
      const rt = await createTestRoomType(app, token, { name: 'Adjacent Type' });
      const room = await createTestRoom(app, token, rt.id, { name: 'Adjacent Room' });
      const guest = await createTestGuest(app, token);

      // Book Apr 1–5
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId: guest.id, roomId: room.id, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      // Check Apr 5–9 (check-in = prior check-out → no overlap)
      const res = await app.inject({
        method: 'GET', url: '/api/v1/availability?checkIn=2026-04-05&checkOut=2026-04-09', headers: headers(),
      });
      const names = JSON.parse(res.body).data.map((r: Record<string, unknown>) => (r.room as Record<string, unknown>).name);
      expect(names).toContain('Adjacent Room');
    });

    it('should allow booking when check-out equals next booking check-in (adjacent, no gap)', async () => {
      const rt = await createTestRoomType(app, token, { name: 'Prior Adjacent Type' });
      const room = await createTestRoom(app, token, rt.id, { name: 'Prior Adjacent Room' });
      const guest = await createTestGuest(app, token);

      // Book Apr 1–5
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId: guest.id, roomId: room.id, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      // Check Mar 28–Apr 1 (check-out = next booking check-in → no overlap)
      const res = await app.inject({
        method: 'GET', url: '/api/v1/availability?checkIn=2026-03-28&checkOut=2026-04-01', headers: headers(),
      });
      const names = JSON.parse(res.body).data.map((r: Record<string, unknown>) => (r.room as Record<string, unknown>).name);
      expect(names).toContain('Prior Adjacent Room');
    });
  });

  describe('Availability', () => {
    it('should return available rooms excluding booked ones', async () => {
      // Setup room type + rooms
      const rtRes = await app.inject({
        method: 'POST', url: '/api/v1/room-types', headers: headers(),
        payload: { name: 'Standard', basePrice: 10000, maxOccupancy: 2 },
      });
      const roomTypeId = JSON.parse(rtRes.body).data.id;

      const r1Res = await app.inject({
        method: 'POST', url: '/api/v1/rooms', headers: headers(),
        payload: { roomTypeId, name: 'Room A' },
      });
      const roomAId = JSON.parse(r1Res.body).data.id;

      await app.inject({
        method: 'POST', url: '/api/v1/rooms', headers: headers(),
        payload: { roomTypeId, name: 'Room B' },
      });

      // Create a guest and book Room A
      const guestRes = await app.inject({
        method: 'POST', url: '/api/v1/guests', headers: headers(),
        payload: { name: 'Alice', email: 'alice@test.com' },
      });
      const guestId = JSON.parse(guestRes.body).data.id;

      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId: roomAId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      // Check availability for overlapping dates
      const res = await app.inject({
        method: 'GET', url: '/api/v1/availability?checkIn=2026-04-02&checkOut=2026-04-04', headers: headers(),
      });

      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].room.name).toBe('Room B');
      expect(body.data[0].nights).toBe(2);
      expect(body.data[0].totalPrice).toBe(20000);
    });

    it('should apply season multiplier', async () => {
      const rtRes = await app.inject({
        method: 'POST', url: '/api/v1/room-types', headers: headers(),
        payload: { name: 'Standard', basePrice: 10000, maxOccupancy: 2 },
      });
      const roomTypeId = JSON.parse(rtRes.body).data.id;

      await app.inject({
        method: 'POST', url: '/api/v1/rooms', headers: headers(),
        payload: { roomTypeId, name: 'Room A' },
      });

      await app.inject({
        method: 'POST', url: '/api/v1/seasons', headers: headers(),
        payload: { name: 'Summer', startDate: '2026-06-01', endDate: '2026-09-30', priceMultiplier: 1.5 },
      });

      const res = await app.inject({
        method: 'GET', url: '/api/v1/availability?checkIn=2026-07-01&checkOut=2026-07-04', headers: headers(),
      });

      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].seasonMultiplier).toBe(1.5);
      expect(body.data[0].pricePerNight).toBe(15000);
      expect(body.data[0].totalPrice).toBe(45000);
    });
  });

  describe('Edge cases', () => {
    it('should return 404 when creating room with non-existent room type', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/rooms', headers: headers(),
        payload: { roomTypeId: 'nonexistent', name: 'Ghost Room' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('should exclude maintenance rooms from availability', async () => {
      const rt = await createTestRoomType(app, token, { name: 'Maint Test' });
      await createTestRoom(app, token, rt.id, { name: 'Available Room', status: 'available' });
      await createTestRoom(app, token, rt.id, { name: 'Maintenance Room', status: 'maintenance' });

      const res = await app.inject({
        method: 'GET', url: '/api/v1/availability?checkIn=2026-05-01&checkOut=2026-05-05', headers: headers(),
      });

      const body = JSON.parse(res.body);
      const names = body.data.map((r: Record<string, unknown>) => (r.room as Record<string, unknown>).name);
      expect(names).toContain('Available Room');
      expect(names).not.toContain('Maintenance Room');
    });

    it('should return empty availability when all rooms are booked', async () => {
      const rt = await createTestRoomType(app, token, { name: 'Busy Type' });
      const room = await createTestRoom(app, token, rt.id, { name: 'Only Room' });
      const guest = await createTestGuest(app, token);

      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId: guest.id, roomId: room.id, checkIn: '2026-05-01', checkOut: '2026-05-10', totalPrice: 90000 },
      });

      const res = await app.inject({
        method: 'GET', url: '/api/v1/availability?checkIn=2026-05-03&checkOut=2026-05-07', headers: headers(),
      });

      expect(JSON.parse(res.body).data).toHaveLength(0);
    });

    it('should filter availability by roomTypeId', async () => {
      const rt1 = await createTestRoomType(app, token, { name: 'Type A' });
      const rt2 = await createTestRoomType(app, token, { name: 'Type B' });
      await createTestRoom(app, token, rt1.id, { name: 'Room Type A' });
      await createTestRoom(app, token, rt2.id, { name: 'Room Type B' });

      const res = await app.inject({
        method: 'GET', url: `/api/v1/availability?checkIn=2026-05-01&checkOut=2026-05-05&roomTypeId=${rt1.id}`, headers: headers(),
      });

      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].roomType.name).toBe('Type A');
    });

    it('should reject invalid date range on availability', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/availability?checkIn=2026-05-10&checkOut=2026-05-05', headers: headers(),
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 404 when updating non-existent room', async () => {
      const res = await app.inject({
        method: 'PATCH', url: '/api/v1/rooms/nonexistent', headers: headers(),
        payload: { name: 'Ghost' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 when updating non-existent room type', async () => {
      const res = await app.inject({
        method: 'PATCH', url: '/api/v1/room-types/nonexistent', headers: headers(),
        payload: { name: 'Ghost' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 when updating non-existent season', async () => {
      const res = await app.inject({
        method: 'PATCH', url: '/api/v1/seasons/nonexistent', headers: headers(),
        payload: { name: 'Ghost' },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
