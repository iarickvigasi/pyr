import type { PrismaClient, BookingStatus } from '@prisma/client';
import type { PaginatedResult } from '../../lib/pagination.js';
import { clampLimit } from '../../lib/pagination.js';
import { notDeleted, computeChanges } from '../../lib/prisma-helpers.js';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { NotFoundError, ConflictError, BadRequestError } from '../../lib/errors.js';
import type { CreateBookingBody, UpdateBookingBody, ListBookingsQuery } from './booking.schema.js';

const VALID_TRANSITIONS: Record<string, string[]> = {
  inquiry: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'cancelled'],
  checked_in: ['checked_out', 'cancelled'],
  checked_out: [],
  cancelled: [],
};

async function checkOverlap(
  prisma: PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  roomId: string,
  checkIn: Date,
  checkOut: Date,
  excludeBookingId?: string,
): Promise<void> {
  const where: Record<string, unknown> = {
    roomId,
    deletedAt: null,
    status: { in: ['inquiry', 'confirmed', 'checked_in'] },
    checkIn: { lt: checkOut },
    checkOut: { gt: checkIn },
  };
  if (excludeBookingId) {
    where.id = { not: excludeBookingId };
  }

  const overlap = await (prisma as PrismaClient).booking.findFirst({ where: where as any });
  if (overlap) {
    throw new ConflictError('Room is already booked for the requested dates');
  }
}

export async function listBookings(
  prisma: PrismaClient,
  query: ListBookingsQuery,
): Promise<PaginatedResult<Record<string, unknown>>> {
  const limit = clampLimit(query.limit);
  const where: Record<string, unknown> = { ...notDeleted };

  if (query.status) where.status = query.status;
  if (query.guestId) where.guestId = query.guestId;
  if (query.from) where.checkOut = { ...(where.checkOut as any || {}), gt: new Date(query.from) };
  if (query.to) where.checkIn = { ...(where.checkIn as any || {}), lt: new Date(query.to) };

  const bookings = await prisma.booking.findMany({
    where: where as any,
    take: limit + 1,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    orderBy: { checkIn: 'desc' },
    include: {
      guest: { select: { id: true, name: true, email: true } },
      room: { select: { id: true, name: true, roomType: { select: { name: true } } } },
    },
  });

  const hasMore = bookings.length > limit;
  const data = hasMore ? bookings.slice(0, limit) : bookings;

  return {
    data: data as unknown as Record<string, unknown>[],
    nextCursor: hasMore ? data[data.length - 1]!.id : null,
    hasMore,
  };
}

export async function getBooking(
  prisma: PrismaClient,
  id: string,
): Promise<Record<string, unknown>> {
  const booking = await prisma.booking.findFirst({
    where: { id, ...notDeleted },
    include: {
      guest: { select: { id: true, name: true, email: true, phone: true, language: true } },
      room: { include: { roomType: true } },
    },
  });

  if (!booking) throw new NotFoundError('Booking', id);
  return booking as unknown as Record<string, unknown>;
}

export async function createBooking(
  prisma: PrismaClient,
  data: CreateBookingBody,
  actorId?: string,
): Promise<Record<string, unknown>> {
  const checkIn = new Date(data.checkIn);
  const checkOut = new Date(data.checkOut);

  if (checkOut <= checkIn) {
    throw new BadRequestError('Check-out date must be after check-in date');
  }

  return prisma.$transaction(async (tx) => {
    // Verify guest exists
    const guest = await tx.guest.findFirst({ where: { id: data.guestId, ...notDeleted } });
    if (!guest) throw new NotFoundError('Guest', data.guestId);

    // Verify room exists
    const room = await tx.room.findUnique({ where: { id: data.roomId } });
    if (!room) throw new NotFoundError('Room', data.roomId);

    // Check for overlapping bookings
    await checkOverlap(tx, data.roomId, checkIn, checkOut);

    const booking = await tx.booking.create({
      data: {
        guestId: data.guestId,
        roomId: data.roomId,
        checkIn,
        checkOut,
        status: data.status as BookingStatus,
        totalPrice: data.totalPrice,
        source: data.source ?? null,
        notes: data.notes ?? null,
      },
    });

    await writeAuditLog(tx as unknown as PrismaClient, {
      entityType: 'booking',
      entityId: booking.id,
      action: 'create',
      changes: data as unknown as Record<string, unknown>,
      actor: getActor(actorId),
    });

    return booking as unknown as Record<string, unknown>;
  });
}

export async function updateBooking(
  prisma: PrismaClient,
  id: string,
  data: UpdateBookingBody,
  actorId?: string,
): Promise<Record<string, unknown>> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.booking.findFirst({ where: { id, ...notDeleted } });
    if (!existing) throw new NotFoundError('Booking', id);

    // Validate status transition
    if (data.status && data.status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status];
      if (!allowed?.includes(data.status)) {
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

    const booking = await tx.booking.update({
      where: { id },
      data: {
        ...(data.roomId !== undefined ? { roomId: data.roomId } : {}),
        ...(data.checkIn !== undefined ? { checkIn: new Date(data.checkIn) } : {}),
        ...(data.checkOut !== undefined ? { checkOut: new Date(data.checkOut) } : {}),
        ...(data.status !== undefined ? { status: data.status as BookingStatus } : {}),
        ...(data.totalPrice !== undefined ? { totalPrice: data.totalPrice } : {}),
        ...(data.source !== undefined ? { source: data.source ?? null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
      },
    });

    const changes = computeChanges(
      existing as unknown as Record<string, unknown>,
      booking as unknown as Record<string, unknown>,
    );
    if (changes) {
      await writeAuditLog(tx as unknown as PrismaClient, {
        entityType: 'booking',
        entityId: id,
        action: 'update',
        changes,
        actor: getActor(actorId),
      });
    }

    return booking as unknown as Record<string, unknown>;
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

    await writeAuditLog(tx as unknown as PrismaClient, {
      entityType: 'booking',
      entityId: id,
      action: 'delete',
      changes: { previousStatus: existing.status },
      actor: getActor(actorId),
    });
  });
}
