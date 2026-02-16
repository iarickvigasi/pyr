import type { PrismaClient, Prisma } from '@prisma/client';
import { writeAuditLog } from '../../lib/audit.js';
import { computeChanges } from '../../lib/prisma-helpers.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import type {
  CreateRoomTypeBody,
  UpdateRoomTypeBody,
  CreateRoomBody,
  UpdateRoomBody,
  CreateSeasonBody,
  UpdateSeasonBody,
  AvailabilityQuery,
} from './room.schema.js';

function getActor(userId?: string): string {
  return userId ? `admin:${userId}` : 'system';
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
  const roomType = await prisma.roomType.create({ data });

  await writeAuditLog(prisma, {
    entityType: 'room_type',
    entityId: roomType.id,
    action: 'create',
    changes: data as unknown as Record<string, unknown>,
    actor: getActor(actorId),
  });

  return roomType;
}

export async function updateRoomType(
  prisma: PrismaClient,
  id: string,
  data: UpdateRoomTypeBody,
  actorId?: string,
): Promise<unknown> {
  const existing = await prisma.roomType.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('RoomType', id);

  const updated = await prisma.roomType.update({ where: { id }, data });

  const changes = computeChanges(
    existing as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
  );
  if (changes) {
    await writeAuditLog(prisma, {
      entityType: 'room_type',
      entityId: id,
      action: 'update',
      changes,
      actor: getActor(actorId),
    });
  }

  return updated;
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
  const roomType = await prisma.roomType.findUnique({ where: { id: data.roomTypeId } });
  if (!roomType) throw new NotFoundError('RoomType', data.roomTypeId);

  const room = await prisma.room.create({ data });

  await writeAuditLog(prisma, {
    entityType: 'room',
    entityId: room.id,
    action: 'create',
    changes: data as unknown as Record<string, unknown>,
    actor: getActor(actorId),
  });

  return room;
}

export async function updateRoom(
  prisma: PrismaClient,
  id: string,
  data: UpdateRoomBody,
  actorId?: string,
): Promise<unknown> {
  const existing = await prisma.room.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Room', id);

  const updated = await prisma.room.update({ where: { id }, data });

  const changes = computeChanges(
    existing as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
  );
  if (changes) {
    await writeAuditLog(prisma, {
      entityType: 'room',
      entityId: id,
      action: 'update',
      changes,
      actor: getActor(actorId),
    });
  }

  return updated;
}

// ─── Seasons ─────────────────────────────────────────────

export async function listSeasons(prisma: PrismaClient): Promise<unknown[]> {
  return prisma.season.findMany({ orderBy: { startDate: 'asc' } });
}

export async function createSeason(
  prisma: PrismaClient,
  data: CreateSeasonBody,
  actorId?: string,
): Promise<unknown> {
  if (data.endDate <= data.startDate) {
    throw new BadRequestError('End date must be after start date');
  }

  const season = await prisma.season.create({
    data: {
      name: data.name,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      priceMultiplier: data.priceMultiplier,
    },
  });

  await writeAuditLog(prisma, {
    entityType: 'season',
    entityId: season.id,
    action: 'create',
    changes: data as unknown as Record<string, unknown>,
    actor: getActor(actorId),
  });

  return season;
}

export async function updateSeason(
  prisma: PrismaClient,
  id: string,
  data: UpdateSeasonBody,
  actorId?: string,
): Promise<unknown> {
  const existing = await prisma.season.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Season', id);

  const startDate = data.startDate ? new Date(data.startDate) : undefined;
  const endDate = data.endDate ? new Date(data.endDate) : undefined;

  const updated = await prisma.season.update({
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
    await writeAuditLog(prisma, {
      entityType: 'season',
      entityId: id,
      action: 'update',
      changes,
      actor: getActor(actorId),
    });
  }

  return updated;
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

  // Find applicable season
  const season = await prisma.season.findFirst({
    where: {
      startDate: { lte: checkIn },
      endDate: { gte: checkIn },
    },
  });

  const multiplier = season ? Number(season.priceMultiplier) : 1.0;
  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

  return rooms
    .filter((room) => !bookedRoomIds.has(room.id))
    .map((room) => {
      const pricePerNight = Math.round(room.roomType.basePrice * multiplier);
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
        totalPrice: pricePerNight * nights,
        seasonMultiplier: multiplier,
      };
    });
}
