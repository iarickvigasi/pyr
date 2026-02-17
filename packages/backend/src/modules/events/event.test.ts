import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, cleanDatabase, getAuthToken, prisma } from '../../test/setup.js';

describe('Events API', () => {
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

  async function createGuest(name: string): Promise<string> {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/guests', headers: headers(),
      payload: { name, email: `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}@test.com` },
    });
    return JSON.parse(res.body).data.id;
  }

  async function createEvent(capacity = 8): Promise<string> {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/events', headers: headers(),
      payload: {
        type: 'puppy_yoga', title: 'Test Yoga', date: '2026-04-01',
        time: '09:00', capacity, location: 'Rooftop',
      },
    });
    return JSON.parse(res.body).data.id;
  }

  describe('POST /api/v1/events', () => {
    it('should create an event', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/events', headers: headers(),
        payload: {
          type: 'puppy_yoga', title: 'Sunrise Yoga', date: '2026-04-01',
          time: '07:30', capacity: 8, location: 'Rooftop',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.title).toBe('Sunrise Yoga');
      expect(body.data.type).toBe('puppy_yoga');
    });
  });

  describe('POST /api/v1/events/:id/book', () => {
    it('should register a guest as confirmed when capacity available', async () => {
      const eventId = await createEvent(2);
      const guestId = await createGuest('Alice');

      const res = await app.inject({
        method: 'POST', url: `/api/v1/events/${eventId}/book`, headers: headers(),
        payload: { guestId },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe('confirmed');
    });

    it('should waitlist when at capacity', async () => {
      const eventId = await createEvent(1);
      const guest1 = await createGuest('Alice');
      const guest2 = await createGuest('Bob');

      await app.inject({
        method: 'POST', url: `/api/v1/events/${eventId}/book`, headers: headers(),
        payload: { guestId: guest1 },
      });

      const res = await app.inject({
        method: 'POST', url: `/api/v1/events/${eventId}/book`, headers: headers(),
        payload: { guestId: guest2 },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe('waitlisted');
    });

    it('should prevent duplicate registration', async () => {
      const eventId = await createEvent(8);
      const guestId = await createGuest('Alice');

      await app.inject({
        method: 'POST', url: `/api/v1/events/${eventId}/book`, headers: headers(),
        payload: { guestId },
      });

      const res = await app.inject({
        method: 'POST', url: `/api/v1/events/${eventId}/book`, headers: headers(),
        payload: { guestId },
      });

      expect(res.statusCode).toBe(409);
    });

    it('should allow re-registration after cancellation', async () => {
      const eventId = await createEvent(8);
      const guestId = await createGuest('Alice');

      // Register
      const regRes = await app.inject({
        method: 'POST', url: `/api/v1/events/${eventId}/book`, headers: headers(),
        payload: { guestId },
      });
      const regId = JSON.parse(regRes.body).data.id;

      // Cancel via direct DB (simulate cancellation)
      await prisma.eventBooking.update({
        where: { id: regId },
        data: { status: 'cancelled' },
      });

      // Re-register
      const res = await app.inject({
        method: 'POST', url: `/api/v1/events/${eventId}/book`, headers: headers(),
        payload: { guestId },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe('confirmed');
    });
  });

  describe('GET /api/v1/events/:id/registrations', () => {
    it('should list registrations with guest info', async () => {
      const eventId = await createEvent(8);
      const guestId = await createGuest('Alice');

      await app.inject({
        method: 'POST', url: `/api/v1/events/${eventId}/book`, headers: headers(),
        payload: { guestId },
      });

      const res = await app.inject({
        method: 'GET', url: `/api/v1/events/${eventId}/registrations`, headers: headers(),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].guest.name).toBe('Alice');
    });
  });

  describe('DELETE /api/v1/events/:id', () => {
    it('should delete event and its registrations', async () => {
      const eventId = await createEvent(8);
      const guestId = await createGuest('Alice');

      await app.inject({
        method: 'POST', url: `/api/v1/events/${eventId}/book`, headers: headers(),
        payload: { guestId },
      });

      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/events/${eventId}`, headers: headers(),
      });

      expect(res.statusCode).toBe(204);

      const event = await prisma.event.findUnique({ where: { id: eventId } });
      expect(event).toBeNull();

      const regs = await prisma.eventBooking.findMany({ where: { eventId } });
      expect(regs).toHaveLength(0);
    });
  });

  describe('GET /api/v1/events', () => {
    it('should filter by type', async () => {
      await app.inject({
        method: 'POST', url: '/api/v1/events', headers: headers(),
        payload: { type: 'puppy_yoga', title: 'Yoga', date: '2026-04-01', time: '09:00', capacity: 8 },
      });
      await app.inject({
        method: 'POST', url: '/api/v1/events', headers: headers(),
        payload: { type: 'beach_walk', title: 'Walk', date: '2026-04-02', time: '10:00', capacity: 12 },
      });

      const res = await app.inject({
        method: 'GET', url: '/api/v1/events?type=puppy_yoga', headers: headers(),
      });

      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].type).toBe('puppy_yoga');
    });

    it('should filter by date range', async () => {
      await app.inject({
        method: 'POST', url: '/api/v1/events', headers: headers(),
        payload: { type: 'puppy_yoga', title: 'March Yoga', date: '2026-03-15', time: '09:00', capacity: 8 },
      });
      await app.inject({
        method: 'POST', url: '/api/v1/events', headers: headers(),
        payload: { type: 'puppy_yoga', title: 'May Yoga', date: '2026-05-15', time: '09:00', capacity: 8 },
      });

      const res = await app.inject({
        method: 'GET', url: '/api/v1/events?from=2026-03-01&to=2026-03-31', headers: headers(),
      });

      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe('March Yoga');
    });
  });

  describe('Edge cases', () => {
    it('should return 404 for GET non-existent event', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/events/nonexistent', headers: headers(),
      });
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 for PATCH non-existent event', async () => {
      const res = await app.inject({
        method: 'PATCH', url: '/api/v1/events/nonexistent', headers: headers(),
        payload: { title: 'Updated' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 for DELETE non-existent event', async () => {
      const res = await app.inject({
        method: 'DELETE', url: '/api/v1/events/nonexistent', headers: headers(),
      });
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 when registering for non-existent event', async () => {
      const guestId = await createGuest('Alice');
      const res = await app.inject({
        method: 'POST', url: '/api/v1/events/nonexistent/book', headers: headers(),
        payload: { guestId },
      });
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 when registering non-existent guest', async () => {
      const eventId = await createEvent();
      const res = await app.inject({
        method: 'POST', url: `/api/v1/events/${eventId}/book`, headers: headers(),
        payload: { guestId: 'nonexistent' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('should update event fields via PATCH', async () => {
      const eventId = await createEvent();

      const res = await app.inject({
        method: 'PATCH', url: `/api/v1/events/${eventId}`, headers: headers(),
        payload: { title: 'Updated Yoga', capacity: 12 },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.title).toBe('Updated Yoga');
      expect(body.data.capacity).toBe(12);
    });

    it('should return 404 for registrations on non-existent event', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/events/nonexistent/registrations', headers: headers(),
      });
      expect(res.statusCode).toBe(404);
    });

    it('should re-register as confirmed after capacity frees up', async () => {
      // Event with capacity 1
      const eventId = await createEvent(1);
      const guest1 = await createGuest('Alice');
      const guest2 = await createGuest('Bob');

      // Fill capacity
      await app.inject({
        method: 'POST', url: `/api/v1/events/${eventId}/book`, headers: headers(),
        payload: { guestId: guest1 },
      });

      // Bob gets waitlisted
      const regRes = await app.inject({
        method: 'POST', url: `/api/v1/events/${eventId}/book`, headers: headers(),
        payload: { guestId: guest2 },
      });
      expect(JSON.parse(regRes.body).data.status).toBe('waitlisted');

      // Cancel Alice's registration (frees capacity)
      const reg1 = await prisma.eventBooking.findUnique({
        where: { eventId_guestId: { eventId, guestId: guest1 } },
      });
      await prisma.eventBooking.update({
        where: { id: reg1!.id },
        data: { status: 'cancelled' },
      });

      // Cancel Bob's, then re-register — should be confirmed now
      const reg2 = await prisma.eventBooking.findUnique({
        where: { eventId_guestId: { eventId, guestId: guest2 } },
      });
      await prisma.eventBooking.update({
        where: { id: reg2!.id },
        data: { status: 'cancelled' },
      });

      const reRegRes = await app.inject({
        method: 'POST', url: `/api/v1/events/${eventId}/book`, headers: headers(),
        payload: { guestId: guest2 },
      });
      expect(JSON.parse(reRegRes.body).data.status).toBe('confirmed');
    });
  });
});
