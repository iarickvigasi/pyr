import type { PrismaClient, Prisma } from '@prisma/client';
import type { PaginatedResult } from '../../lib/pagination.js';
import { clampLimit } from '../../lib/pagination.js';
import { notDeleted, computeChanges } from '../../lib/prisma-helpers.js';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { NotFoundError, ConflictError, BadRequestError } from '../../lib/errors.js';
import type { CreateGuestBody, UpdateGuestBody, ListGuestsQuery } from './guest.schema.js';
import type { Guest, GuestDetailWithRelations } from '../../types/entities.js';

export async function listGuests(
  prisma: PrismaClient,
  query: ListGuestsQuery,
): Promise<PaginatedResult<Guest>> {
  const limit = clampLimit(query.limit);
  const where: Prisma.GuestWhereInput = { ...notDeleted };

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.tag) {
    where.tags = { has: query.tag };
  }
  if (query.source) {
    where.source = query.source;
  }
  if (query.language) {
    where.language = query.language;
  }

  const guests = await prisma.guest.findMany({
    where,
    take: limit + 1,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    orderBy: { createdAt: 'desc' },
  });

  const hasMore = guests.length > limit;
  const data = hasMore ? guests.slice(0, limit) : guests;

  return {
    data: data as Guest[],
    nextCursor: hasMore ? data[data.length - 1]!.id : null,
    hasMore,
  };
}

export async function getGuest(
  prisma: PrismaClient,
  id: string,
): Promise<GuestDetailWithRelations> {
  const guest = await prisma.guest.findFirst({
    where: { id, ...notDeleted },
    include: {
      bookings: {
        where: notDeleted,
        include: {
          room: { include: { roomType: { select: { name: true } } } },
        },
        orderBy: { checkIn: 'desc' },
      },
      eventBookings: {
        include: {
          event: {
            select: { id: true, title: true, date: true, type: true, time: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      conversations: {
        select: {
          id: true,
          channel: true,
          subject: true,
          status: true,
          lastMessageAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      _count: {
        select: {
          bookings: { where: notDeleted },
          conversations: true,
          eventBookings: true,
        },
      },
    },
  });

  if (!guest) {
    throw new NotFoundError('Guest', id);
  }

  return guest as unknown as GuestDetailWithRelations;
}

export async function createGuest(
  prisma: PrismaClient,
  data: CreateGuestBody,
  actorId?: string,
): Promise<Guest> {
  return prisma.$transaction(async (tx) => {
    if (data.email) {
      const existing = await tx.guest.findFirst({
        where: { email: data.email, ...notDeleted },
      });
      if (existing) {
        throw new ConflictError(`Guest with email '${data.email}' already exists`);
      }
    }

    const guest = await tx.guest.create({ data });

    await writeAuditLog(tx, {
      entityType: 'guest',
      entityId: guest.id,
      action: 'create',
      changes: data as unknown as Record<string, unknown>,
      actor: getActor(actorId),
    });

    return guest as Guest;
  });
}

export async function updateGuest(
  prisma: PrismaClient,
  id: string,
  data: UpdateGuestBody,
  actorId?: string,
): Promise<Guest> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.guest.findFirst({
      where: { id, ...notDeleted },
    });
    if (!existing) {
      throw new NotFoundError('Guest', id);
    }

    if (data.email && data.email !== existing.email) {
      const duplicate = await tx.guest.findFirst({
        where: { email: data.email, ...notDeleted, id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictError(`Guest with email '${data.email}' already exists`);
      }
    }

    const guest = await tx.guest.update({
      where: { id },
      data,
    });

    const changes = computeChanges(
      existing as unknown as Record<string, unknown>,
      guest as unknown as Record<string, unknown>,
    );
    if (changes) {
      await writeAuditLog(tx, {
        entityType: 'guest',
        entityId: guest.id,
        action: 'update',
        changes,
        actor: getActor(actorId),
      });
    }

    return guest as Guest;
  });
}

export async function deleteGuest(
  prisma: PrismaClient,
  id: string,
  actorId?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.guest.findFirst({
      where: { id, ...notDeleted },
    });
    if (!existing) {
      throw new NotFoundError('Guest', id);
    }

    await tx.guest.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await writeAuditLog(tx, {
      entityType: 'guest',
      entityId: id,
      action: 'delete',
      actor: getActor(actorId),
    });
  });
}

export async function mergeGuests(
  prisma: PrismaClient,
  primaryId: string,
  secondaryId: string,
  actorId?: string,
): Promise<Guest> {
  if (primaryId === secondaryId) {
    throw new BadRequestError('Cannot merge a guest with itself');
  }

  return await prisma.$transaction(async (tx) => {
    const primary = await tx.guest.findFirst({
      where: { id: primaryId, ...notDeleted },
    });
    if (!primary) {
      throw new NotFoundError('Guest', primaryId);
    }

    const secondary = await tx.guest.findFirst({
      where: { id: secondaryId, ...notDeleted },
    });
    if (!secondary) {
      throw new NotFoundError('Guest', secondaryId);
    }

    // Move all related records from secondary to primary
    await tx.booking.updateMany({
      where: { guestId: secondaryId },
      data: { guestId: primaryId },
    });
    await tx.conversation.updateMany({
      where: { guestId: secondaryId },
      data: { guestId: primaryId },
    });
    await tx.eventBooking.updateMany({
      where: { guestId: secondaryId },
      data: { guestId: primaryId },
    });
    await tx.invoice.updateMany({
      where: { guestId: secondaryId },
      data: { guestId: primaryId },
    });

    // Soft-delete the secondary guest
    await tx.guest.update({
      where: { id: secondaryId },
      data: { deletedAt: new Date() },
    });

    // Merge tags (union) and fill in null fields from secondary
    const mergedTags = [...new Set([...primary.tags, ...secondary.tags])];
    const updated = await tx.guest.update({
      where: { id: primaryId },
      data: {
        tags: mergedTags,
        phone: primary.phone ?? secondary.phone,
        dietaryNeeds: primary.dietaryNeeds ?? secondary.dietaryNeeds,
        notes: primary.notes
          ? secondary.notes
            ? `${primary.notes}\n---\n${secondary.notes}`
            : primary.notes
          : secondary.notes,
      },
    });

    await writeAuditLog(tx, {
      entityType: 'guest',
      entityId: primaryId,
      action: 'update',
      changes: { mergedFrom: secondaryId, mergedTags },
      actor: getActor(actorId),
    });

    await writeAuditLog(tx, {
      entityType: 'guest',
      entityId: secondaryId,
      action: 'delete',
      changes: { mergedInto: primaryId },
      actor: getActor(actorId),
    });

    return updated as Guest;
  });
}
