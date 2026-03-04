import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, cleanDatabase, getAuthToken, prisma } from '../../test/setup.js';
import { createFullBookingSetup, createTestGuest } from '../../test/factories.js';

describe('Bookings API', () => {
  let app: FastifyInstance;
  let token: string;
  let guestId: string;
  let guestId2: string;
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

    // Create second guest for multi-guest tests
    const guest2 = await createTestGuest(app, token, { name: 'Guest Two' });
    guestId2 = guest2.id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const headers = () => ({ authorization: `Bearer ${token}` });

  describe('POST /api/v1/bookings', () => {
    it('should create a booking with guestIds', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.guestId).toBe(guestId);
      expect(body.data.status).toBe('inquiry');
    });

    it('should prevent double-booking', async () => {
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-03', checkOut: '2026-04-07', totalPrice: 40000 },
      });

      expect(res.statusCode).toBe(409);
    });

    it('should allow booking different rooms for same dates', async () => {
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId: roomId2, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      expect(res.statusCode).toBe(201);
    });

    it('should reject invalid date range', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-05', checkOut: '2026-04-01', totalPrice: 40000 },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/v1/bookings/:id', () => {
    it('should enforce valid status transitions', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });
      const id = JSON.parse(createRes.body).data.id;

      // inquiry -> confirmed: valid
      const res1 = await app.inject({
        method: 'PATCH', url: `/api/v1/bookings/${id}`, headers: headers(),
        payload: { status: 'confirmed' },
      });
      expect(res1.statusCode).toBe(200);

      // confirmed -> inquiry: invalid
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
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      // Book Room A for April 10-15
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-10', checkOut: '2026-04-15', totalPrice: 50000 },
      });
      const id = JSON.parse(createRes.body).data.id;

      // Try to move second booking to overlap with first
      const res = await app.inject({
        method: 'PATCH', url: `/api/v1/bookings/${id}`, headers: headers(),
        payload: { checkIn: '2026-04-03' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('should soft-delete booking when status is set to cancelled via PATCH', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });
      const id = JSON.parse(createRes.body).data.id as string;

      const cancelRes = await app.inject({
        method: 'PATCH', url: `/api/v1/bookings/${id}`, headers: headers(),
        payload: { status: 'cancelled' },
      });
      expect(cancelRes.statusCode).toBe(200);

      const booking = await prisma.booking.findUnique({ where: { id } });
      expect(booking?.status).toBe('cancelled');
      expect(booking?.deletedAt).not.toBeNull();
    });
  });

  describe('DELETE /api/v1/bookings/:id', () => {
    it('should cancel a booking', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
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
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000, status: 'confirmed' },
      });
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId: roomId2, checkIn: '2026-05-01', checkOut: '2026-05-05', totalPrice: 40000 },
      });

      const res = await app.inject({
        method: 'GET', url: '/api/v1/bookings?status=confirmed', headers: headers(),
      });

      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].status).toBe('confirmed');
    });

    it('should support cursor pagination', async () => {
      // Create 3 bookings on different rooms across 3 months
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-07-01', checkOut: '2026-07-05', totalPrice: 40000 },
      });
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId: roomId2, checkIn: '2026-08-01', checkOut: '2026-08-05', totalPrice: 40000 },
      });
      // Third booking needs a third room
      const roomTypeRes = await app.inject({
        method: 'POST', url: '/api/v1/room-types', headers: headers(),
        payload: { name: 'Pagination Test Type', basePrice: 10000, maxOccupancy: 2 },
      });
      const roomTypeId3 = JSON.parse(roomTypeRes.body).data.id;
      const roomRes = await app.inject({
        method: 'POST', url: '/api/v1/rooms', headers: headers(),
        payload: { roomTypeId: roomTypeId3, name: 'Room C' },
      });
      const roomId3 = JSON.parse(roomRes.body).data.id;
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId: roomId3, checkIn: '2026-09-01', checkOut: '2026-09-05', totalPrice: 40000 },
      });

      // Page 1: limit=2 -> should have 2 results + hasMore + cursor
      const page1 = await app.inject({
        method: 'GET', url: '/api/v1/bookings?limit=2', headers: headers(),
      });
      const body1 = JSON.parse(page1.body);
      expect(body1.data).toHaveLength(2);
      expect(body1.hasMore).toBe(true);
      expect(body1.nextCursor).toBeTruthy();

      // Page 2: use cursor -> should have 1 result + hasMore=false
      const page2 = await app.inject({
        method: 'GET',
        url: `/api/v1/bookings?limit=2&cursor=${body1.nextCursor}`,
        headers: headers(),
      });
      const body2 = JSON.parse(page2.body);
      expect(body2.data).toHaveLength(1);
      expect(body2.hasMore).toBe(false);
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
        payload: { guestIds: [guestId], roomId, checkIn: '2026-06-01', checkOut: '2026-06-05', totalPrice: 40000 },
      });
      const id = JSON.parse(createRes.body).data.id;
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
      // Cancelled bookings are soft-deleted, so follow-up updates should not find them.
      expect(statusCode).toBe(404);
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
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      // New booking starts exactly when first ends
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-05', checkOut: '2026-04-10', totalPrice: 50000 },
      });
      expect(res.statusCode).toBe(201);
    });

    it('should not block on cancelled bookings', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });
      const id = JSON.parse(createRes.body).data.id;

      // Cancel it
      await app.inject({
        method: 'DELETE', url: `/api/v1/bookings/${id}`, headers: headers(),
      });

      // Book same room same dates
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });
      expect(res.statusCode).toBe(201);
    });

    it('should reject fully-contained overlap', async () => {
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-01', checkOut: '2026-04-10', totalPrice: 90000 },
      });

      // Contained within existing booking
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-03', checkOut: '2026-04-07', totalPrice: 40000 },
      });
      expect(res.statusCode).toBe(409);
    });

    it('should allow re-booking after cancel', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });
      const id = JSON.parse(createRes.body).data.id;

      await app.inject({
        method: 'DELETE', url: `/api/v1/bookings/${id}`, headers: headers(),
      });

      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-02', checkOut: '2026-04-06', totalPrice: 40000 },
      });
      expect(res.statusCode).toBe(201);
    });
  });

  describe('Error cases', () => {
    it('should return 404 for non-existent guest', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: ['nonexistent'], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 for non-existent room', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId: 'nonexistent', checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
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

  describe('Multi-guest bookings', () => {
    it('should create a booking with multiple guests', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId, guestId2], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      // Legacy guestId should be set to first guest
      expect(body.data.guestId).toBe(guestId);

      // Verify via GET detail
      const detailRes = await app.inject({
        method: 'GET', url: `/api/v1/bookings/${body.data.id}`, headers: headers(),
      });
      const detail = JSON.parse(detailRes.body);
      expect(detail.data.bookingGuests).toHaveLength(2);
      const bgGuestIds = detail.data.bookingGuests.map((bg: { guest: { id: string } }) => bg.guest.id);
      expect(bgGuestIds).toContain(guestId);
      expect(bgGuestIds).toContain(guestId2);
    });

    it('should reject empty guestIds array', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should reject non-existent guest in guestIds', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId, 'nonexistent'], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should update guest list via PATCH', async () => {
      // Create with 1 guest
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });
      const id = JSON.parse(createRes.body).data.id;

      // Update to 2 guests
      const patchRes = await app.inject({
        method: 'PATCH', url: `/api/v1/bookings/${id}`, headers: headers(),
        payload: { guestIds: [guestId, guestId2] },
      });
      expect(patchRes.statusCode).toBe(200);

      // Verify via GET detail
      const detailRes = await app.inject({
        method: 'GET', url: `/api/v1/bookings/${id}`, headers: headers(),
      });
      const detail = JSON.parse(detailRes.body);
      expect(detail.data.bookingGuests).toHaveLength(2);
      const bgGuestIds = detail.data.bookingGuests.map((bg: { guest: { id: string } }) => bg.guest.id);
      expect(bgGuestIds).toContain(guestId);
      expect(bgGuestIds).toContain(guestId2);
    });

    it('should remove a guest via PATCH guestIds', async () => {
      // Create with 2 guests
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId, guestId2], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });
      const id = JSON.parse(createRes.body).data.id;

      // Remove second guest
      const patchRes = await app.inject({
        method: 'PATCH', url: `/api/v1/bookings/${id}`, headers: headers(),
        payload: { guestIds: [guestId] },
      });
      expect(patchRes.statusCode).toBe(200);

      // Verify only 1 guest remains
      const detailRes = await app.inject({
        method: 'GET', url: `/api/v1/bookings/${id}`, headers: headers(),
      });
      const detail = JSON.parse(detailRes.body);
      expect(detail.data.bookingGuests).toHaveLength(1);
      expect(detail.data.bookingGuests[0].guest.id).toBe(guestId);
    });

    it('should filter bookings by secondary guest', async () => {
      // Create booking with 2 guests
      await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestIds: [guestId, guestId2], roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      // Filter by secondary guest (guestId2)
      const res = await app.inject({
        method: 'GET', url: `/api/v1/bookings?guestId=${guestId2}`, headers: headers(),
      });
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].guestId).toBe(guestId); // Legacy column is first guest
    });

    it('should accept legacy guestId for backward compat', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: { guestId, roomId, checkIn: '2026-04-01', checkOut: '2026-04-05', totalPrice: 40000 },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.guestId).toBe(guestId);

      // Verify junction table has 1 entry
      const detailRes = await app.inject({
        method: 'GET', url: `/api/v1/bookings/${body.data.id}`, headers: headers(),
      });
      const detail = JSON.parse(detailRes.body);
      expect(detail.data.bookingGuests).toHaveLength(1);
      expect(detail.data.bookingGuests[0].guest.id).toBe(guestId);
    });
  });

  describe('POST /api/v1/bookings/:id/sync/motopress', () => {
    function configureMotopress(): void {
      app.config.MOTOPRESS_ENABLED = true;
      app.config.MOTOPRESS_BASE_URL = 'https://example.com/wp-json/mphb/v1';
      app.config.MOTOPRESS_CONSUMER_KEY = 'ck_test';
      app.config.MOTOPRESS_CONSUMER_SECRET = 'cs_test';
      app.config.MOTOPRESS_TIMEOUT_MS = 5000;
    }

    it('syncs booking to MotoPress with mapped room', async () => {
      configureMotopress();

      await app.inject({
        method: 'POST', url: '/api/v1/room-mappings', headers: headers(),
        payload: {
          roomId,
          provider: 'motopress',
          externalAccommodationId: '1913',
          defaultAdults: 2,
          defaultChildren: 0,
        },
      });

      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: {
          guestIds: [guestId],
          roomId,
          checkIn: '2026-04-01',
          checkOut: '2026-04-05',
          totalPrice: 40000,
          status: 'confirmed',
        },
      });
      const bookingId = JSON.parse(createRes.body).data.id as string;

      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          id: 4242,
          status: 'confirmed',
          check_in_date: '2026-04-01',
          check_out_date: '2026-04-05',
          customer: { email: 'guest@example.com' },
          total_price: 400,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const syncRes = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingId}/sync/motopress`,
        headers: headers(),
      });

      expect(syncRes.statusCode).toBe(200);
      const syncBody = JSON.parse(syncRes.body);
      expect(syncBody.data.externalBookingId).toBe('4242');
      expect(syncBody.data.syncStatus).toBe('synced');

      const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(url.toString()).toContain('/bookings');
      expect(init.method).toBe('POST');

      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(booking.externalProvider).toBe('motopress');
      expect(booking.externalBookingId).toBe('4242');
      expect(booking.syncStatus).toBe('synced');
      expect(booking.syncError).toBeNull();
    });

    it('returns 400 when room mapping is missing', async () => {
      configureMotopress();

      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/bookings', headers: headers(),
        payload: {
          guestIds: [guestId],
          roomId,
          checkIn: '2026-04-01',
          checkOut: '2026-04-05',
          totalPrice: 40000,
        },
      });
      const bookingId = JSON.parse(createRes.body).data.id as string;

      const syncRes = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${bookingId}/sync/motopress`,
        headers: headers(),
      });

      expect(syncRes.statusCode).toBe(400);
      expect(syncRes.body).toContain('not mapped');
    });
  });
});
