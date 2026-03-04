import type { PrismaClient, BookingStatus, Prisma } from '@prisma/client';
import type { PaginatedResult } from '../../lib/pagination.js';
import { clampLimit } from '../../lib/pagination.js';
import { notDeleted, computeChanges } from '../../lib/prisma-helpers.js';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { NotFoundError, ConflictError, BadRequestError } from '../../lib/errors.js';
import type { CreateBookingBody, UpdateBookingBody, ListBookingsQuery } from './booking.schema.js';
import type { Booking, BookingWithRelations, PaymentStatus } from '../../types/entities.js';
import type { PrismaClientOrTx } from '../../types/prisma.js';

// Typed as Record<BookingStatus, ...> for compile-time exhaustiveness — adding a new
// BookingStatus to the Prisma schema will cause a type error here, preventing silent failures.
const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  inquiry: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'cancelled'],
  checked_in: ['checked_out', 'cancelled'],
  checked_out: [],
  cancelled: [],
};

async function checkOverlap(
  prisma: PrismaClientOrTx,
  roomId: string,
  checkIn: Date,
  checkOut: Date,
  excludeBookingId?: string,
): Promise<void> {
  const where: Prisma.BookingWhereInput = {
    roomId,
    deletedAt: null,
    status: { in: ['inquiry', 'confirmed', 'checked_in'] },
    checkIn: { lt: checkOut },
    checkOut: { gt: checkIn },
  };
  if (excludeBookingId) {
    where.id = { not: excludeBookingId };
  }

  const overlap = await prisma.booking.findFirst({ where });
  if (overlap) {
    throw new ConflictError('Room is already booked for the requested dates');
  }
}

export async function listBookings(
  prisma: PrismaClient,
  query: ListBookingsQuery,
): Promise<PaginatedResult<BookingWithRelations>> {
  const limit = clampLimit(query.limit);
  const where: Prisma.BookingWhereInput = { ...notDeleted };

  if (query.status) where.status = query.status as BookingStatus;
  if (query.guestId) {
    where.bookingGuests = { some: { guestId: query.guestId } };
  }
  if (query.from) {
    where.checkOut = { gt: new Date(query.from) };
  }
  if (query.to) {
    where.checkIn = { lt: new Date(query.to) };
  }

  const bookings = await prisma.booking.findMany({
    where,
    take: limit + 1,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    orderBy: { checkIn: 'desc' },
    include: {
      guest: { select: { id: true, name: true, email: true } },
      room: { select: { id: true, name: true, roomType: { select: { name: true } } } },
      bookingGuests: {
        include: { guest: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  const hasMore = bookings.length > limit;
  const data = hasMore ? bookings.slice(0, limit) : bookings;

  // Batch-fetch payment totals for all bookings in this page
  const bookingIds = data.map(b => b.id);
  const paymentSums = await prisma.payment.groupBy({
    by: ['bookingId'],
    _sum: { amount: true },
    where: { bookingId: { in: bookingIds }, deletedAt: null },
  });

  const paidMap = new Map(paymentSums.map(p => [p.bookingId, p._sum.amount ?? 0]));

  const enriched = data.map(b => {
    const totalPaid = paidMap.get(b.id) ?? 0;
    let paymentStatus: PaymentStatus;
    if (totalPaid >= b.totalPrice) paymentStatus = 'paid';
    else if (totalPaid > 0) paymentStatus = 'partial';
    else paymentStatus = 'unpaid';
    return { ...b, paymentStatus, totalPaid };
  });

  // Post-query filter by paymentStatus (computed field, not a DB column)
  let result = enriched;
  if (query.paymentStatus) {
    result = enriched.filter(b => b.paymentStatus === query.paymentStatus);
  }

  return {
    data: result as unknown as BookingWithRelations[],
    nextCursor: hasMore ? data[data.length - 1]!.id : null,
    hasMore,
  };
}

export async function getBooking(
  prisma: PrismaClient,
  id: string,
): Promise<BookingWithRelations> {
  const booking = await prisma.booking.findFirst({
    where: { id, ...notDeleted },
    include: {
      guest: { select: { id: true, name: true, email: true, phone: true, language: true } },
      room: { include: { roomType: true } },
      bookingGuests: {
        include: { guest: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  if (!booking) throw new NotFoundError('Booking', id);

  // Fetch non-deleted payments for this booking
  const payments = await prisma.payment.findMany({
    where: { bookingId: id, deletedAt: null },
    orderBy: { date: 'desc' },
  });

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  return {
    ...booking,
    payments,
    paymentSummary: {
      totalPrice: booking.totalPrice,
      totalPaid,
      balanceDue: booking.totalPrice - totalPaid,
    },
  } as BookingWithRelations;
}

export async function createBooking(
  prisma: PrismaClient,
  data: CreateBookingBody,
  actorId?: string,
): Promise<Booking> {
  // Normalize: accept guestId (legacy) or guestIds (new)
  const guestIds = data.guestIds ?? (data.guestId ? [data.guestId] : []);

  const checkIn = new Date(data.checkIn);
  const checkOut = new Date(data.checkOut);

  if (checkOut <= checkIn) {
    throw new BadRequestError('Check-out date must be after check-in date');
  }

  return prisma.$transaction(async (tx) => {
    // Verify ALL guests exist and are not soft-deleted
    const existingGuests = await tx.guest.findMany({
      where: { id: { in: guestIds }, deletedAt: null },
      select: { id: true },
    });
    if (existingGuests.length !== guestIds.length) {
      const foundIds = new Set(existingGuests.map(g => g.id));
      const missingIds = guestIds.filter(id => !foundIds.has(id));
      throw new NotFoundError('Guest', missingIds.join(', '));
    }

    // Verify room exists
    const room = await tx.room.findUnique({ where: { id: data.roomId } });
    if (!room) throw new NotFoundError('Room', data.roomId);

    // Check for overlapping bookings
    await checkOverlap(tx, data.roomId, checkIn, checkOut);

    const booking = await tx.booking.create({
      data: {
        guestId: guestIds[0]!, // Legacy column: always set to first guest
        roomId: data.roomId,
        checkIn,
        checkOut,
        status: data.status as BookingStatus,
        totalPrice: data.totalPrice,
        source: data.source ?? null,
        notes: data.notes ?? null,
      },
    });

    // Create junction table rows for all guests
    await tx.bookingGuest.createMany({
      data: guestIds.map(gId => ({
        bookingId: booking.id,
        guestId: gId,
      })),
    });

    await writeAuditLog(tx, {
      entityType: 'booking',
      entityId: booking.id,
      action: 'create',
      changes: { ...data, guestIds } as Record<string, unknown>,
      actor: getActor(actorId),
    });

    return booking as Booking;
  });
}

export async function updateBooking(
  prisma: PrismaClient,
  id: string,
  data: UpdateBookingBody,
  actorId?: string,
): Promise<Booking> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.booking.findFirst({ where: { id, ...notDeleted } });
    if (!existing) throw new NotFoundError('Booking', id);
    const nextStatus = data.status as BookingStatus | undefined;
    const statusChangedToCancelled = nextStatus === 'cancelled' && existing.status !== 'cancelled';

    // Validate status transition
    if (data.status && data.status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status];
      if (!allowed?.includes(data.status as BookingStatus)) {
        throw new BadRequestError(
          `Cannot transition from '${existing.status}' to '${data.status}'`,
        );
      }
    }

    // If room or dates change, re-check availability
    const newRoomId = data.roomId ?? existing.roomId;
    const newCheckIn = data.checkIn ? new Date(data.checkIn) : existing.checkIn;
    const newCheckOut = data.checkOut ? new Date(data.checkOut) : existing.checkOut;

    if (newCheckOut <= newCheckIn) {
      throw new BadRequestError('Check-out date must be after check-in date');
    }

    if (data.roomId || data.checkIn || data.checkOut) {
      await checkOverlap(tx, newRoomId, newCheckIn, newCheckOut, id);
    }

    // Handle guestIds update via junction table diff
    if (data.guestIds) {
      // Validate ALL new guests exist and are not soft-deleted
      const existingGuests = await tx.guest.findMany({
        where: { id: { in: data.guestIds }, deletedAt: null },
        select: { id: true },
      });
      if (existingGuests.length !== data.guestIds.length) {
        const foundIds = new Set(existingGuests.map(g => g.id));
        const missingIds = data.guestIds.filter(gId => !foundIds.has(gId));
        throw new NotFoundError('Guest', missingIds.join(', '));
      }

      // Diff strategy: compute adds and removes
      const currentGuests = await tx.bookingGuest.findMany({
        where: { bookingId: id },
        select: { guestId: true },
      });
      const existingIds = new Set(currentGuests.map(bg => bg.guestId));
      const newIds = new Set(data.guestIds);

      const toRemove = [...existingIds].filter(gId => !newIds.has(gId));
      if (toRemove.length > 0) {
        await tx.bookingGuest.deleteMany({
          where: { bookingId: id, guestId: { in: toRemove } },
        });
      }

      const toAdd = [...newIds].filter(gId => !existingIds.has(gId));
      if (toAdd.length > 0) {
        await tx.bookingGuest.createMany({
          data: toAdd.map(gId => ({ bookingId: id, guestId: gId })),
        });
      }
    }

    const booking = await tx.booking.update({
      where: { id },
      data: {
        // Update legacy guestId to first guest when guestIds changes
        ...(data.guestIds ? { guestId: data.guestIds[0]! } : {}),
        ...(data.roomId !== undefined ? { roomId: data.roomId } : {}),
        ...(data.checkIn !== undefined ? { checkIn: new Date(data.checkIn) } : {}),
        ...(data.checkOut !== undefined ? { checkOut: new Date(data.checkOut) } : {}),
        ...(nextStatus !== undefined ? { status: nextStatus } : {}),
        ...(statusChangedToCancelled ? { deletedAt: new Date() } : {}),
        ...(data.totalPrice !== undefined ? { totalPrice: data.totalPrice } : {}),
        ...(data.source !== undefined ? { source: data.source ?? null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
      },
    });

    const changes = computeChanges(
      existing as Record<string, unknown>,
      booking as Record<string, unknown>,
    );
    if (changes || data.guestIds) {
      await writeAuditLog(tx, {
        entityType: 'booking',
        entityId: id,
        action: 'update',
        changes: { ...changes, ...(data.guestIds ? { guestIds: data.guestIds } : {}) },
        actor: getActor(actorId),
      });
    }

    return booking as Booking;
  });
}

export async function cancelBooking(
  prisma: PrismaClient,
  id: string,
  actorId?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.booking.findFirst({ where: { id, ...notDeleted } });
    if (!existing) throw new NotFoundError('Booking', id);

    const allowed = VALID_TRANSITIONS[existing.status];
    if (!allowed?.includes('cancelled')) {
      throw new BadRequestError(`Cannot cancel a booking with status '${existing.status}'`);
    }

    await tx.booking.update({
      where: { id },
      data: { status: 'cancelled', deletedAt: new Date() },
    });

    await writeAuditLog(tx, {
      entityType: 'booking',
      entityId: id,
      action: 'delete',
      changes: { previousStatus: existing.status },
      actor: getActor(actorId),
    });
  });
}
