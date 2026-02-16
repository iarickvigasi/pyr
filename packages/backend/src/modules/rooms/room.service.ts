import type { PrismaClient } from '@prisma/client';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { computeChanges } from '../../lib/prisma-helpers.js';
import { NotFoundError, BadRequestError, ConflictError } from '../../lib/errors.js';
import type {
  CreateRoomTypeBody,
  UpdateRoomTypeBody,
  CreateRoomBody,
  UpdateRoomBody,
  CreateSeasonBody,
  UpdateSeasonBody,
  AvailabilityQuery,
} from './room.schema.js';

function handleUniqueViolation(err: unknown, entity: string): never {
  if (
    err instanceof Error &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  ) {
    throw new ConflictError(`${entity} with that name already exists`);
  }
  throw err;
}

// ─── Room Types ──────────────────────────────────────────

export async function listRoomTypes(prisma: PrismaClient): Promise<unknown[]> {
  return prisma.roomType.findMany({
    include: { rooms: true },
    orderBy: { name: 'asc' },
  });
}

export async function createRoomType(
  prisma: PrismaClient,
  data: CreateRoomTypeBody,
  actorId?: string,
): Promise<unknown> {
  return prisma.$transaction(async (tx) => {
    let roomType;
    try {
      roomType = await tx.roomType.create({ data });
    } catch (err) {
      handleUniqueViolation(err, 'RoomType');
    }

    await writeAuditLog(tx as unknown as PrismaClient, {
      entityType: 'room_type',
      entityId: roomType.id,
      action: 'create',
      changes: data as unknown as Record<string, unknown>,
      actor: getActor(actorId),
    });

    return roomType;
  });
}

export async function updateRoomType(
  prisma: PrismaClient,
  id: string,
  data: UpdateRoomTypeBody,
  actorId?: string,
): Promise<unknown> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.roomType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('RoomType', id);

    let updated;
    try {
      updated = await tx.roomType.update({ where: { id }, data });
    } catch (err) {
      handleUniqueViolation(err, 'RoomType');
    }

    const changes = computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );
    if (changes) {
      await writeAuditLog(tx as unknown as PrismaClient, {
        entityType: 'room_type',
        entityId: id,
        action: 'update',
        changes,
        actor: getActor(actorId),
      });
    }

    return updated;
  });
}

// ─── Rooms ───────────────────────────────────────────────

export async function listRooms(prisma: PrismaClient): Promise<unknown[]> {
  return prisma.room.findMany({
    include: { roomType: true },
    orderBy: { name: 'asc' },
  });
}

export async function createRoom(
  prisma: PrismaClient,
  data: CreateRoomBody,
  actorId?: string,
): Promise<unknown> {
  return prisma.$transaction(async (tx) => {
    const roomType = await tx.roomType.findUnique({ where: { id: data.roomTypeId } });
    if (!roomType) throw new NotFoundError('RoomType', data.roomTypeId);

    let room;
    try {
      room = await tx.room.create({ data });
    } catch (err) {
      handleUniqueViolation(err, 'Room');
    }

    await writeAuditLog(tx as unknown as PrismaClient, {
      entityType: 'room',
      entityId: room.id,
      action: 'create',
      changes: data as unknown as Record<string, unknown>,
      actor: getActor(actorId),
    });

    return room;
  });
}

export async function updateRoom(
  prisma: PrismaClient,
  id: string,
  data: UpdateRoomBody,
  actorId?: string,
): Promise<unknown> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.room.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Room', id);

    let updated;
    try {
      updated = await tx.room.update({ where: { id }, data });
    } catch (err) {
      handleUniqueViolation(err, 'Room');
    }

    const changes = computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );
    if (changes) {
      await writeAuditLog(tx as unknown as PrismaClient, {
        entityType: 'room',
        entityId: id,
        action: 'update',
        changes,
        actor: getActor(actorId),
      });
    }

    return updated;
  });
}

// ─── Seasons ─────────────────────────────────────────────

export async function listSeasons(prisma: PrismaClient): Promise<unknown[]> {
  return prisma.season.findMany({ orderBy: { startDate: 'asc' } });
}

async function checkSeasonOverlap(
  prisma: PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  startDate: Date,
  endDate: Date,
  excludeId?: string,
): Promise<void> {
  const where: Record<string, unknown> = {
    startDate: { lt: endDate },
    endDate: { gt: startDate },
  };
  if (excludeId) {
    where.id = { not: excludeId };
  }
  const overlap = await (prisma as PrismaClient).season.findFirst({ where: where as any });
  if (overlap) {
    throw new ConflictError(`Season overlaps with existing season '${overlap.name}'`);
  }
}

export async function createSeason(
  prisma: PrismaClient,
  data: CreateSeasonBody,
  actorId?: string,
): Promise<unknown> {
  if (data.endDate <= data.startDate) {
    throw new BadRequestError('End date must be after start date');
  }

  return prisma.$transaction(async (tx) => {
    await checkSeasonOverlap(tx, new Date(data.startDate), new Date(data.endDate));

    const season = await tx.season.create({
      data: {
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        priceMultiplier: data.priceMultiplier,
      },
    });

    await writeAuditLog(tx as unknown as PrismaClient, {
      entityType: 'season',
      entityId: season.id,
      action: 'create',
      changes: data as unknown as Record<string, unknown>,
      actor: getActor(actorId),
    });

    return season;
  });
}

export async function updateSeason(
  prisma: PrismaClient,
  id: string,
  data: UpdateSeasonBody,
  actorId?: string,
): Promise<unknown> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.season.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Season', id);

    const startDate = data.startDate ? new Date(data.startDate) : undefined;
    const endDate = data.endDate ? new Date(data.endDate) : undefined;

    // Validate the resulting date range
    const effectiveStart = startDate ?? existing.startDate;
    const effectiveEnd = endDate ?? existing.endDate;
    if (effectiveEnd <= effectiveStart) {
      throw new BadRequestError('End date must be after start date');
    }

    // Check for overlapping seasons (excluding self)
    await checkSeasonOverlap(tx, effectiveStart, effectiveEnd, id);

    const updated = await tx.season.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(data.priceMultiplier !== undefined ? { priceMultiplier: data.priceMultiplier } : {}),
      },
    });

    const changes = computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );
    if (changes) {
      await writeAuditLog(tx as unknown as PrismaClient, {
        entityType: 'season',
        entityId: id,
        action: 'update',
        changes,
        actor: getActor(actorId),
      });
    }

    return updated;
  });
}

// ─── Availability ────────────────────────────────────────

export interface AvailableRoom {
  room: { id: string; name: string; status: string };
  roomType: { id: string; name: string; basePrice: number; maxOccupancy: number };
  nights: number;
  pricePerNight: number;
  totalPrice: number;
  seasonMultiplier: number;
}

export async function checkAvailability(
  prisma: PrismaClient,
  query: AvailabilityQuery,
): Promise<AvailableRoom[]> {
  const checkIn = new Date(query.checkIn);
  const checkOut = new Date(query.checkOut);

  if (checkOut <= checkIn) {
    throw new BadRequestError('Check-out date must be after check-in date');
  }

  // Find rooms with overlapping active bookings
  const overlappingBookings = await prisma.booking.findMany({
    where: {
      deletedAt: null,
      status: { in: ['inquiry', 'confirmed', 'checked_in'] },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { roomId: true },
  });

  const bookedRoomIds = new Set(overlappingBookings.map((b) => b.roomId));

  // Get all rooms (optionally filtered by room type)
  const rooms = await prisma.room.findMany({
    where: {
      status: 'available',
      ...(query.roomTypeId ? { roomTypeId: query.roomTypeId } : {}),
    },
    include: { roomType: true },
  });

  // Find all applicable seasons for the date range
  const seasons = await prisma.season.findMany({
    where: {
      startDate: { lt: checkOut },
      endDate: { gt: checkIn },
    },
    orderBy: { startDate: 'asc' },
  });

  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

  return rooms
    .filter((room) => !bookedRoomIds.has(room.id))
    .map((room) => {
      // Calculate per-night pricing based on which season each night falls in
      let totalPrice = 0;
      for (let i = 0; i < nights; i++) {
        const nightDate = new Date(checkIn);
        nightDate.setDate(nightDate.getDate() + i);
        const season = seasons.find(
          (s) => nightDate >= s.startDate && nightDate < s.endDate,
        );
        const multiplier = season ? Number(season.priceMultiplier) : 1.0;
        totalPrice += Math.round(room.roomType.basePrice * multiplier);
      }
      const pricePerNight = Math.round(totalPrice / nights);

      // Use first night's season multiplier as the representative
      const firstSeason = seasons.find(
        (s) => checkIn >= s.startDate && checkIn < s.endDate,
      );
      const seasonMultiplier = firstSeason ? Number(firstSeason.priceMultiplier) : 1.0;

      return {
        room: { id: room.id, name: room.name, status: room.status },
        roomType: {
          id: room.roomType.id,
          name: room.roomType.name,
          basePrice: room.roomType.basePrice,
          maxOccupancy: room.roomType.maxOccupancy,
        },
        nights,
        pricePerNight,
        totalPrice,
        seasonMultiplier,
      };
    });
}
