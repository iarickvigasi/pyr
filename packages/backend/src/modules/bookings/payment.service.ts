import type { PrismaClient, PaymentMethod } from '@prisma/client';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { NotFoundError } from '../../lib/errors.js';
import type { CreatePaymentBody } from './payment.schema.js';
import type { Payment } from '../../types/entities.js';

/**
 * Log a new payment against a booking.
 *
 * The booking lookup does NOT filter by `deletedAt` because per business rules
 * payments can be logged against any booking status, including cancelled
 * (which sets `deletedAt` on the booking).
 */
export async function createPayment(
  prisma: PrismaClient,
  bookingId: string,
  data: CreatePaymentBody,
  actorId?: string,
): Promise<Payment> {
  return prisma.$transaction(async (tx) => {
    // Verify booking exists (no deletedAt filter -- payments allowed on cancelled bookings)
    const booking = await tx.booking.findFirst({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError('Booking', bookingId);

    const payment = await tx.payment.create({
      data: {
        bookingId,
        amount: data.amount,
        method: data.method as PaymentMethod,
        date: data.date ? new Date(data.date) : new Date(),
        notes: data.notes ?? null,
      },
    });

    await writeAuditLog(tx, {
      entityType: 'payment',
      entityId: payment.id,
      action: 'create',
      changes: { bookingId, amount: data.amount, method: data.method, date: data.date ?? null, notes: data.notes ?? null },
      actor: getActor(actorId),
    });

    return payment as Payment;
  });
}

/**
 * Soft-delete a payment entry (sets `deletedAt` timestamp).
 */
export async function deletePayment(
  prisma: PrismaClient,
  bookingId: string,
  paymentId: string,
  actorId?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, bookingId, deletedAt: null },
    });
    if (!payment) throw new NotFoundError('Payment', paymentId);

    await tx.payment.update({
      where: { id: paymentId },
      data: { deletedAt: new Date() },
    });

    await writeAuditLog(tx, {
      entityType: 'payment',
      entityId: paymentId,
      action: 'delete',
      changes: { amount: payment.amount, method: payment.method },
      actor: getActor(actorId),
    });
  });
}

/**
 * List non-deleted payments for a booking, sorted by date descending.
 */
export async function listPayments(
  prisma: PrismaClient,
  bookingId: string,
): Promise<Payment[]> {
  // Verify booking exists (no deletedAt filter -- allow listing for cancelled bookings)
  const booking = await prisma.booking.findFirst({ where: { id: bookingId } });
  if (!booking) throw new NotFoundError('Booking', bookingId);

  const payments = await prisma.payment.findMany({
    where: { bookingId, deletedAt: null },
    orderBy: { date: 'desc' },
  });

  return payments as Payment[];
}
