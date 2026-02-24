import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, cleanDatabase, getAuthToken, prisma } from '../../test/setup.js';
import { createTestBooking, createTestPayment } from '../../test/factories.js';

type BookingData = Record<string, unknown>;
type PaymentData = Record<string, unknown>;
type ListResponse = { data: BookingData[]; hasMore: boolean; nextCursor: string | null };

describe('Payment endpoints', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await getTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    token = await getAuthToken(app);
  });

  // ─── POST /api/v1/bookings/:id/payments ───────────────────────

  describe('POST /bookings/:id/payments', () => {
    it('creates a payment with all fields', async () => {
      const booking = await createTestBooking(app, token);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${booking.id}/payments`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          amount: 45000,
          method: 'bank_transfer',
          date: '2026-03-15',
          notes: 'SEPA ref: PYR-2026-0042',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body) as { data: Record<string, unknown> };
      expect(body.data.id).toBeDefined();
      expect(body.data.amount).toBe(45000);
      expect(body.data.method).toBe('bank_transfer');
      expect(body.data.notes).toBe('SEPA ref: PYR-2026-0042');
      expect(body.data.bookingId).toBe(booking.id);
      expect(body.data.deletedAt).toBeNull();
    });

    it('creates a payment with minimal fields (date defaults to today)', async () => {
      const booking = await createTestBooking(app, token);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${booking.id}/payments`,
        headers: { authorization: `Bearer ${token}` },
        payload: { amount: 10000, method: 'cash' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body) as { data: Record<string, unknown> };
      expect(body.data.amount).toBe(10000);
      expect(body.data.method).toBe('cash');
      expect(body.data.date).toBeDefined();
      expect(body.data.notes).toBeNull();
    });

    it('returns 404 when booking does not exist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/bookings/nonexistent-id/payments',
        headers: { authorization: `Bearer ${token}` },
        payload: { amount: 10000, method: 'cash' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('allows payment on a cancelled (soft-deleted) booking', async () => {
      const booking = await createTestBooking(app, token, { status: 'confirmed' });

      // Cancel the booking (sets deletedAt)
      await app.inject({
        method: 'DELETE',
        url: `/api/v1/bookings/${booking.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      // Payment should still be allowed
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/bookings/${booking.id}/payments`,
        headers: { authorization: `Bearer ${token}` },
        payload: { amount: 5000, method: 'cash' },
      });

      expect(res.statusCode).toBe(201);
    });

    it('creates an audit log entry for payment creation', async () => {
      const booking = await createTestBooking(app, token);
      const payment = await createTestPayment(app, token, booking.id);

      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'payment', entityId: payment.id, action: 'create' },
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]!.actor).toBe('admin:test_admin');
    });
  });

  // ─── DELETE /api/v1/bookings/:id/payments/:paymentId ──────────

  describe('DELETE /bookings/:id/payments/:paymentId', () => {
    it('soft-deletes a payment and returns 204', async () => {
      const booking = await createTestBooking(app, token);
      const payment = await createTestPayment(app, token, booking.id);

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/bookings/${booking.id}/payments/${payment.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(204);
    });

    it('sets deletedAt on the soft-deleted payment', async () => {
      const booking = await createTestBooking(app, token);
      const payment = await createTestPayment(app, token, booking.id);

      await app.inject({
        method: 'DELETE',
        url: `/api/v1/bookings/${booking.id}/payments/${payment.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      const dbPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(dbPayment).not.toBeNull();
      expect(dbPayment!.deletedAt).not.toBeNull();
    });

    it('returns 404 when payment does not exist', async () => {
      const booking = await createTestBooking(app, token);

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/bookings/${booking.id}/payments/nonexistent`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 when payment is already soft-deleted', async () => {
      const booking = await createTestBooking(app, token);
      const payment = await createTestPayment(app, token, booking.id);

      // First delete
      await app.inject({
        method: 'DELETE',
        url: `/api/v1/bookings/${booking.id}/payments/${payment.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      // Second delete should 404
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/bookings/${booking.id}/payments/${payment.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('creates an audit log entry for payment deletion', async () => {
      const booking = await createTestBooking(app, token);
      const payment = await createTestPayment(app, token, booking.id);

      await app.inject({
        method: 'DELETE',
        url: `/api/v1/bookings/${booking.id}/payments/${payment.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'payment', entityId: payment.id, action: 'delete' },
      });

      expect(logs).toHaveLength(1);
      const changes = logs[0]!.changes as Record<string, unknown>;
      expect(changes.amount).toBe(20000);
      expect(changes.method).toBe('bank_transfer');
    });
  });

  // ─── GET /api/v1/bookings/:id/payments ────────────────────────

  describe('GET /bookings/:id/payments', () => {
    it('lists payments sorted by date descending', async () => {
      const booking = await createTestBooking(app, token);

      await createTestPayment(app, token, booking.id, { amount: 10000, date: '2026-03-01' });
      await createTestPayment(app, token, booking.id, { amount: 20000, date: '2026-03-15' });
      await createTestPayment(app, token, booking.id, { amount: 5000, date: '2026-03-10' });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/bookings/${booking.id}/payments`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: Array<{ amount: number }> };
      expect(body.data).toHaveLength(3);
      // Sorted by date desc: 2026-03-15, 2026-03-10, 2026-03-01
      expect(body.data[0]!.amount).toBe(20000);
      expect(body.data[1]!.amount).toBe(5000);
      expect(body.data[2]!.amount).toBe(10000);
    });

    it('excludes soft-deleted payments', async () => {
      const booking = await createTestBooking(app, token);

      const p1 = await createTestPayment(app, token, booking.id, { amount: 10000 });
      await createTestPayment(app, token, booking.id, { amount: 20000 });

      // Soft-delete the first payment
      await app.inject({
        method: 'DELETE',
        url: `/api/v1/bookings/${booking.id}/payments/${p1.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/bookings/${booking.id}/payments`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: Array<{ amount: number }> };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.amount).toBe(20000);
    });

    it('returns 404 when booking does not exist', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/bookings/nonexistent-id/payments',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns empty array when no payments exist', async () => {
      const booking = await createTestBooking(app, token);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/bookings/${booking.id}/payments`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: unknown[] };
      expect(body.data).toHaveLength(0);
    });
  });

  // ─── Booking Detail Payment Summary ─────────────────────────

  describe('Booking detail paymentSummary', () => {
    it('returns paymentSummary with correct totalPaid and balanceDue after logging a payment', async () => {
      const booking = await createTestBooking(app, token, { totalPrice: 50000 });
      await createTestPayment(app, token, booking.id, { amount: 20000 });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/bookings/${booking.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: BookingData };
      const summary = body.data.paymentSummary as { totalPrice: number; totalPaid: number; balanceDue: number };
      expect(summary.totalPrice).toBe(50000);
      expect(summary.totalPaid).toBe(20000);
      expect(summary.balanceDue).toBe(30000);
    });

    it('returns payments array sorted by date desc', async () => {
      const booking = await createTestBooking(app, token);
      await createTestPayment(app, token, booking.id, { amount: 5000, date: '2026-03-01' });
      await createTestPayment(app, token, booking.id, { amount: 15000, date: '2026-03-20' });
      await createTestPayment(app, token, booking.id, { amount: 10000, date: '2026-03-10' });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/bookings/${booking.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: BookingData };
      const payments = body.data.payments as PaymentData[];
      expect(payments).toHaveLength(3);
      // Sorted by date desc: 2026-03-20, 2026-03-10, 2026-03-01
      expect(payments[0]!.amount).toBe(15000);
      expect(payments[1]!.amount).toBe(10000);
      expect(payments[2]!.amount).toBe(5000);
    });

    it('shows balanceDue=totalPrice when no payments exist', async () => {
      const booking = await createTestBooking(app, token, { totalPrice: 60000 });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/bookings/${booking.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: BookingData };
      const summary = body.data.paymentSummary as { totalPrice: number; totalPaid: number; balanceDue: number };
      expect(summary.totalPaid).toBe(0);
      expect(summary.balanceDue).toBe(60000);
    });

    it('excludes soft-deleted payments from paymentSummary', async () => {
      const booking = await createTestBooking(app, token, { totalPrice: 50000 });
      const p1 = await createTestPayment(app, token, booking.id, { amount: 20000 });
      await createTestPayment(app, token, booking.id, { amount: 10000 });

      // Soft-delete the first payment
      await app.inject({
        method: 'DELETE',
        url: `/api/v1/bookings/${booking.id}/payments/${p1.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/bookings/${booking.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: BookingData };
      const summary = body.data.paymentSummary as { totalPrice: number; totalPaid: number; balanceDue: number };
      expect(summary.totalPaid).toBe(10000);
      expect(summary.balanceDue).toBe(40000);
      // Only 1 payment should be in the list
      const payments = body.data.payments as PaymentData[];
      expect(payments).toHaveLength(1);
    });
  });

  // ─── Booking List Payment Status ────────────────────────────

  describe('Booking list paymentStatus', () => {
    it('returns paymentStatus=unpaid when no payments', async () => {
      await createTestBooking(app, token, { totalPrice: 40000 });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as ListResponse;
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.paymentStatus).toBe('unpaid');
    });

    it('returns paymentStatus=partial after partial payment', async () => {
      const booking = await createTestBooking(app, token, { totalPrice: 40000 });
      await createTestPayment(app, token, booking.id, { amount: 15000 });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as ListResponse;
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.paymentStatus).toBe('partial');
    });

    it('returns paymentStatus=paid when fully paid', async () => {
      const booking = await createTestBooking(app, token, { totalPrice: 40000 });
      await createTestPayment(app, token, booking.id, { amount: 40000 });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as ListResponse;
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.paymentStatus).toBe('paid');
    });

    it('returns paymentStatus=paid when overpaid', async () => {
      const booking = await createTestBooking(app, token, { totalPrice: 40000 });
      await createTestPayment(app, token, booking.id, { amount: 50000 });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/bookings',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as ListResponse;
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.paymentStatus).toBe('paid');
    });
  });

  // ─── Total Price Editing (PAY-05 verification) ──────────────

  describe('Total price editing (PAY-05)', () => {
    it('PATCH /bookings/:id with totalPrice updates the price (any status)', async () => {
      const booking = await createTestBooking(app, token, { totalPrice: 40000, status: 'confirmed' });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/bookings/${booking.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { totalPrice: 55000 },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: BookingData };
      expect(body.data.totalPrice).toBe(55000);
    });

    it('updated totalPrice reflected in paymentSummary balanceDue', async () => {
      const booking = await createTestBooking(app, token, { totalPrice: 40000 });
      await createTestPayment(app, token, booking.id, { amount: 20000 });

      // Update totalPrice
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/bookings/${booking.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { totalPrice: 60000 },
      });

      // Fetch detail and verify balance
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/bookings/${booking.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: BookingData };
      const summary = body.data.paymentSummary as { totalPrice: number; totalPaid: number; balanceDue: number };
      expect(summary.totalPrice).toBe(60000);
      expect(summary.totalPaid).toBe(20000);
      expect(summary.balanceDue).toBe(40000);
    });
  });
});
