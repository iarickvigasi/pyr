import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, cleanDatabase, getAuthToken, prisma } from '../../test/setup.js';
import { createFullBookingSetup } from '../../test/factories.js';

describe('Bookings API', () => {
  let app: FastifyInstance;
  let token: string;
  let guestId: string;
  let roomId: string;
  let roomId2: string;

  beforeAll(async () => {
    app = await getTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    token = await getAuthToken(app);

    const setup = await createFullBookingSetup(app, token);
    guestId = setup.guestId;
    roomId = setup.roomId;
    roomId2 = setup.roomId2;
  });

  const headers = () => ({ authorization: `Bearer ${token}` });

  describe('POST /api/v1/bookings', () => {
    it('should create a booking', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.guestId).toBe(guestId);
      expect(body.data.status).toBe('inquiry');
    });

    it('should prevent double-booking', async () => {
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-03', checkOut: '2026-04-07', totalPrice: 40000 },
      });

      expect(res.statusCode).toBe(409);
    });

    it('should allow booking different rooms for same dates', async () => {
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId: roomId2, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      expect(res.statusCode).toBe(201);
    });

    it('should reject invalid date range', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-05', checkOut: '2026-04-01', totalPrice: 40000 },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/v1/bookings/:id', () => {
    it('should enforce valid status transitions', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });
      const id = JSON.parse(createRes.body).data.id;

      // inquiry → confirmed: valid
      const res1 = await app.inject({
        method: 'PATCH', url: `/api/v1/bookings/${id}`, headers: headers(),
        payload: { status: 'confirmed' },
      });
      expect(res1.statusCode).toBe(200);

      // confirmed → inquiry: invalid
      const res2 = await app.inject({
        method: 'PATCH', url: `/api/v1/bookings/${id}`, headers: headers(),
        payload: { status: 'inquiry' },
      });
      expect(res2.statusCode).toBe(400);
    });

    it('should re-check availability when dates change', async () => {
      // Book Room A for April 1-5
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      // Book Room A for April 10-15
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-10', checkOut: '2026-04-15', totalPrice: 50000 },
      });
      const id = JSON.parse(createRes.body).data.id;

      // Try to move second booking to overlap with first
      const res = await app.inject({
        method: 'PATCH', url: `/api/v1/bookings/${id}`, headers: headers(),
        payload: { checkIn: '2026-04-03' },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('DELETE /api/v1/bookings/:id', () => {
    it('should cancel a booking', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });
      const id = JSON.parse(createRes.body).data.id;

      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/bookings/${id}`, headers: headers(),
      });
      expect(res.statusCode).toBe(204);

      // Verify booking is cancelled + soft-deleted
      const booking = await prisma.booking.findUnique({ where: { id } });
      expect(booking?.status).toBe('cancelled');
      expect(booking?.deletedAt).not.toBeNull();
    });
  });

  describe('GET /api/v1/bookings', () => {
    it('should return filtered bookings', async () => {
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000, status: 'confirmed' },
      });
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId: roomId2, checkIn: '2026-05-01', checkOut: '2026-05-05', totalPrice: 40000 },
      });

      const res = await app.inject({
        method: 'GET', url: '/api/v1/bookings?status=confirmed', headers: headers(),
      });

      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].status).toBe('confirmed');
    });
  });

  describe('GET /api/v1/bookings/:id', () => {
    it('should return 404 for non-existent booking', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/bookings/nonexistent', headers: headers(),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Status transitions (exhaustive)', () => {
    async function createAndTransition(transitions: string[]): Promise<{ statusCode: number; body: Record<string, unknown> }> {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-06-01', checkOut: '2026-06-05', totalPrice: 40000 },
      });
      let id = JSON.parse(createRes.body).data.id;
      let lastRes = createRes;

      for (const status of transitions) {
        lastRes = await app.inject({
          method: 'PATCH', url: `/api/v1/bookings/${id}`, headers: headers(),
          payload: { status },
        });
      }

      return { statusCode: lastRes.statusCode, body: JSON.parse(lastRes.body) };
    }

    it('inquiry -> confirmed', async () => {
      const { statusCode, body } = await createAndTransition(['confirmed']);
      expect(statusCode).toBe(200);
      expect(body.data && (body.data as Record<string, unknown>).status).toBe('confirmed');
    });

    it('inquiry -> cancelled', async () => {
      const { statusCode } = await createAndTransition(['cancelled']);
      expect(statusCode).toBe(200);
    });

    it('confirmed -> checked_in', async () => {
      const { statusCode } = await createAndTransition(['confirmed', 'checked_in']);
      expect(statusCode).toBe(200);
    });

    it('confirmed -> cancelled', async () => {
      const { statusCode } = await createAndTransition(['confirmed', 'cancelled']);
      expect(statusCode).toBe(200);
    });

    it('checked_in -> checked_out', async () => {
      const { statusCode } = await createAndTransition(['confirmed', 'checked_in', 'checked_out']);
      expect(statusCode).toBe(200);
    });

    it('checked_in -> cancelled', async () => {
      const { statusCode } = await createAndTransition(['confirmed', 'checked_in', 'cancelled']);
      expect(statusCode).toBe(200);
    });

    it('INVALID: checked_out -> any (no transitions allowed)', async () => {
      const { statusCode } = await createAndTransition(['confirmed', 'checked_in', 'checked_out', 'cancelled']);
      expect(statusCode).toBe(400);
    });

    it('INVALID: cancelled -> any (no transitions allowed)', async () => {
      const { statusCode } = await createAndTransition(['cancelled', 'confirmed']);
      expect(statusCode).toBe(400);
    });

    it('INVALID: confirmed -> inquiry (backwards)', async () => {
      const { statusCode } = await createAndTransition(['confirmed', 'inquiry']);
      expect(statusCode).toBe(400);
    });

    it('INVALID: checked_in -> confirmed (backwards)', async () => {
      const { statusCode } = await createAndTransition(['confirmed', 'checked_in', 'confirmed']);
      expect(statusCode).toBe(400);
    });
  });

  describe('Double-booking edge cases', () => {
    it('should allow boundary dates (checkout=checkin)', async () => {
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      // New booking starts exactly when first ends
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-05', checkOut: '2026-04-10', totalPrice: 50000 },
      });
      expect(res.statusCode).toBe(201);
    });

    it('should not block on cancelled bookings', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });
      const id = JSON.parse(createRes.body).data.id;

      // Cancel it
      await app.inject({
        method: 'DELETE', url: `/api/v1/bookings/${id}`, headers: headers(),
      });

      // Book same room same dates
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });
      expect(res.statusCode).toBe(201);
    });

    it('should reject fully-contained overlap', async () => {
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-01', checkOut: '2026-04-10', totalPrice: 90000 },
      });

      // Contained within existing booking
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-03', checkOut: '2026-04-07', totalPrice: 40000 },
      });
      expect(res.statusCode).toBe(409);
    });

    it('should allow re-booking after cancel', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });
      const id = JSON.parse(createRes.body).data.id;

      await app.inject({
        method: 'DELETE', url: `/api/v1/bookings/${id}`, headers: headers(),
      });

      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-02', checkOut: '2026-04-06', totalPrice: 40000 },
      });
      expect(res.statusCode).toBe(201);
    });
  });

  describe('Error cases', () => {
    it('should return 404 for non-existent guest', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId: 'nonexistent', roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 for non-existent room', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId: 'nonexistent', checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 when updating non-existent booking', async () => {
      const res = await app.inject({
        method: 'PATCH', url: '/api/v1/bookings/nonexistent', headers: headers(),
        payload: { status: 'confirmed' },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
