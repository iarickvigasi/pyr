import type { PrismaClient } from '@prisma/client';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { computeChanges, handleUniqueConstraint } from '../../lib/prisma-helpers.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import type { CreateRoomBody, CreateRoomTypeBody, UpdateRoomBody, UpdateRoomTypeBody } from './room.schema.js';
import type { RoomType, RoomWithType } from '../../types/entities.js';

// ─── Room Types ──────────────────────────────────────────

export async function listRoomTypes(
  prisma: PrismaClient,
): Promise<(RoomType & { rooms: { id: string; name: string; status: string }[] })[]> {
  const result = await prisma.roomType.findMany({
    include: { rooms: true },
    orderBy: { name: 'asc' },
  });
  return result as (RoomType & { rooms: { id: string; name: string; status: string }[] })[];
}

export async function createRoomType(
  prisma: PrismaClient,
  data: CreateRoomTypeBody,
  actorId?: string,
): Promise<RoomType> {
  return prisma.$transaction(async (tx) => {
    const roomType = await tx.roomType.create({ data }).catch((err: unknown) => {
      handleUniqueConstraint(err, 'RoomType');
    });

    await writeAuditLog(tx, {
      entityType: 'room_type',
      entityId: roomType.id,
      action: 'create',
      changes: data as unknown as Record<string, unknown>,
      actor: getActor(actorId),
    });

    return roomType as RoomType;
  });
}

export async function updateRoomType(
  prisma: PrismaClient,
  id: string,
  data: UpdateRoomTypeBody,
  actorId?: string,
): Promise<RoomType> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.roomType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('RoomType', id);

    const updated = await tx.roomType.update({ where: { id }, data }).catch((err: unknown) => {
      handleUniqueConstraint(err, 'RoomType');
    });

    const changes = computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );
    if (changes) {
      await writeAuditLog(tx, {
        entityType: 'room_type',
        entityId: id,
        action: 'update',
        changes,
        actor: getActor(actorId),
      });
    }

    return updated as RoomType;
  });
}

export async function deleteRoomType(
  prisma: PrismaClient,
  id: string,
  actorId?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.roomType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('RoomType', id);

    const roomsCount = await tx.room.count({ where: { roomTypeId: id } });
    if (roomsCount > 0) {
      throw new ConflictError(
        `Cannot delete room type '${existing.name}' because ${roomsCount} room(s) still use it`,
      );
    }

    await tx.roomType.delete({ where: { id } });

    await writeAuditLog(tx, {
      entityType: 'room_type',
      entityId: id,
      action: 'delete',
      actor: getActor(actorId),
    });
  });
}

// ─── Rooms ───────────────────────────────────────────────

export async function listRooms(prisma: PrismaClient): Promise<RoomWithType[]> {
  const result = await prisma.room.findMany({
    include: { roomType: true },
    orderBy: { name: 'asc' },
  });
  return result as RoomWithType[];
}

export async function createRoom(
  prisma: PrismaClient,
  data: CreateRoomBody,
  actorId?: string,
): Promise<RoomWithType> {
  return prisma.$transaction(async (tx) => {
    const roomType = await tx.roomType.findUnique({ where: { id: data.roomTypeId } });
    if (!roomType) throw new NotFoundError('RoomType', data.roomTypeId);

    const room = await tx.room.create({ data }).catch((err: unknown) => {
      handleUniqueConstraint(err, 'Room');
    });

    await writeAuditLog(tx, {
      entityType: 'room',
      entityId: room.id,
      action: 'create',
      changes: data as unknown as Record<string, unknown>,
      actor: getActor(actorId),
    });

    return room as RoomWithType;
  });
}

export async function updateRoom(
  prisma: PrismaClient,
  id: string,
  data: UpdateRoomBody,
  actorId?: string,
): Promise<RoomWithType> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.room.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Room', id);

    const updated = await tx.room.update({ where: { id }, data }).catch((err: unknown) => {
      handleUniqueConstraint(err, 'Room');
    });

    const changes = computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );
    if (changes) {
      await writeAuditLog(tx, {
        entityType: 'room',
        entityId: id,
        action: 'update',
        changes,
        actor: getActor(actorId),
      });
    }

    return updated as RoomWithType;
  });
}

export async function deleteRoom(
  prisma: PrismaClient,
  id: string,
  actorId?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.room.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Room', id);

    // Active (non-soft-deleted) bookings must block room deletion.
    const activeBookingsCount = await tx.booking.count({
      where: {
        roomId: id,
        deletedAt: null,
        status: { in: ['inquiry', 'confirmed', 'checked_in'] },
      },
    });
    if (activeBookingsCount > 0) {
      throw new ConflictError(
        `Cannot delete room '${existing.name}' because it has ${activeBookingsCount} active booking(s)`,
      );
    }

    // Purge cancelled + soft-deleted bookings to release FK references to this room.
    const archivedBookings = await tx.booking.findMany({
      where: {
        roomId: id,
        OR: [
          { deletedAt: { not: null } },
          { status: 'cancelled' },
        ],
      },
      select: { id: true },
    });
    if (archivedBookings.length > 0) {
      const archivedBookingIds = archivedBookings.map((b) => b.id);
      const linkedInvoicesCount = await tx.invoice.count({
        where: { bookingId: { in: archivedBookingIds } },
      });
      if (linkedInvoicesCount > 0) {
        throw new ConflictError(
          `Cannot delete room '${existing.name}' because archived bookings still have ${linkedInvoicesCount} invoice(s)`,
        );
      }

      // Calendar rows tied to booking-only entries would violate chk_calendar_event_xor
      // when booking_id gets nulled by FK on booking delete. Purge them first.
      await tx.calendarEvent.deleteMany({
        where: { bookingId: { in: archivedBookingIds } },
      });

      await tx.booking.deleteMany({
        where: { id: { in: archivedBookingIds } },
      });
    }

    await tx.room.delete({ where: { id } });

    await writeAuditLog(tx, {
      entityType: 'room',
      entityId: id,
      action: 'delete',
      changes: {
        purgedArchivedBookings: archivedBookings.length,
      },
      actor: getActor(actorId),
    });
  });
}
