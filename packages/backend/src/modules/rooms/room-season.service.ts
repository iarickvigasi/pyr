import type { Prisma, PrismaClient } from '@prisma/client';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { computeChanges } from '../../lib/prisma-helpers.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import type { PrismaClientOrTx } from '../../types/prisma.js';
import type {
  AvailabilityQuery,
  CreateSeasonBody,
  UpdateSeasonBody,
} from './room.schema.js';
import type { Season } from '../../types/entities.js';

// ─── Seasons ─────────────────────────────────────────────

export async function listSeasons(prisma: PrismaClient): Promise<Season[]> {
  const result = await prisma.season.findMany({ orderBy: { startDate: 'asc' } });
  return result as Season[];
}

async function checkSeasonOverlap(
  prisma: PrismaClientOrTx,
  startDate: Date,
  endDate: Date,
  excludeId?: string,
): Promise<void> {
  const where: Prisma.SeasonWhereInput = {
    startDate: { lt: endDate },
    endDate: { gt: startDate },
  };
  if (excludeId) {
    where.id = { not: excludeId };
  }
  const overlap = await prisma.season.findFirst({ where });
  if (overlap) {
    throw new ConflictError(`Season overlaps with existing season '${overlap.name}'`);
  }
}

export async function createSeason(
  prisma: PrismaClient,
  data: CreateSeasonBody,
  actorId?: string,
): Promise<Season> {
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

    await writeAuditLog(tx, {
      entityType: 'season',
      entityId: season.id,
      action: 'create',
      changes: data as unknown as Record<string, unknown>,
      actor: getActor(actorId),
    });

    return season as Season;
  });
}

export async function updateSeason(
  prisma: PrismaClient,
  id: string,
  data: UpdateSeasonBody,
  actorId?: string,
): Promise<Season> {
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
      await writeAuditLog(tx, {
        entityType: 'season',
        entityId: id,
        action: 'update',
        changes,
        actor: getActor(actorId),
      });
    }

    return updated as Season;
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
      for (let i = 0; i < nights; i += 1) {
        const nightDate = new Date(checkIn);
        nightDate.setDate(nightDate.getDate() + i);
        const season = seasons.find(
          (s) => nightDate >= s.startDate && nightDate < s.endDate,
        );
        // Convert Decimal via toString() to avoid IEEE 754 drift during coercion
        const multiplier = season ? Number(season.priceMultiplier.toString()) : 1.0;
        totalPrice += Math.round(room.roomType.basePrice * multiplier);
      }
      const pricePerNight = Math.round(totalPrice / nights);

      // Use first night's season multiplier as the representative
      const firstSeason = seasons.find(
        (s) => checkIn >= s.startDate && checkIn < s.endDate,
      );
      const seasonMultiplier = firstSeason ? Number(firstSeason.priceMultiplier.toString()) : 1.0;

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
