import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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
