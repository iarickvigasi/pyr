import type { PrismaClient, EventType, EventBookingStatus } from '@prisma/client';
import type { PaginatedResult } from '../../lib/pagination.js';
import { clampLimit } from '../../lib/pagination.js';
import { notDeleted, computeChanges } from '../../lib/prisma-helpers.js';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { NotFoundError, ConflictError, BadRequestError } from '../../lib/errors.js';
import type { CreateEventBody, UpdateEventBody, ListEventsQuery } from './event.schema.js';

export async function listEvents(
  prisma: PrismaClient,
  query: ListEventsQuery,
): Promise<PaginatedResult<Record<string, unknown>>> {
  const limit = clampLimit(query.limit);
  const where: Record<string, unknown> = {};

  if (query.type) where.type = query.type;
  if (query.from) where.date = { ...(where.date as any || {}), gte: new Date(query.from) };
  if (query.to) where.date = { ...(where.date as any || {}), lte: new Date(query.to) };

  const events = await prisma.event.findMany({
    where: where as any,
    take: limit + 1,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    orderBy: { date: 'asc' },
    include: {
      _count: {
        select: {
          eventBookings: { where: { status: 'confirmed' } },
        },
      },
    },
  });

  const hasMore = events.length > limit;
  const data = hasMore ? events.slice(0, limit) : events;

  return {
    data: data as unknown as Record<string, unknown>[],
    nextCursor: hasMore ? data[data.length - 1]!.id : null,
    hasMore,
  };
}

export async function getEvent(
  prisma: PrismaClient,
  id: string,
): Promise<Record<string, unknown>> {
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      eventBookings: {
        include: {
          guest: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!event) throw new NotFoundError('Event', id);
  return event as unknown as Record<string, unknown>;
}

export async function createEvent(
  prisma: PrismaClient,
  data: CreateEventBody,
  actorId?: string,
): Promise<Record<string, unknown>> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        type: data.type as EventType,
        title: data.title,
        date: new Date(data.date),
        time: data.time,
        capacity: data.capacity,
        location: data.location ?? null,
        description: data.description ?? null,
      },
    });

    await writeAuditLog(tx as unknown as PrismaClient, {
      entityType: 'event',
      entityId: event.id,
      action: 'create',
      changes: data as unknown as Record<string, unknown>,
      actor: getActor(actorId),
    });

    return event as unknown as Record<string, unknown>;
  });
}

export async function updateEvent(
  prisma: PrismaClient,
  id: string,
  data: UpdateEventBody,
  actorId?: string,
): Promise<Record<string, unknown>> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.event.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Event', id);

    const event = await tx.event.update({
      where: { id },
      data: {
        ...(data.type !== undefined ? { type: data.type as EventType } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.date !== undefined ? { date: new Date(data.date) } : {}),
        ...(data.time !== undefined ? { time: data.time } : {}),
        ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
        ...(data.location !== undefined ? { location: data.location ?? null } : {}),
        ...(data.description !== undefined ? { description: data.description ?? null } : {}),
      },
    });

    const changes = computeChanges(
      existing as unknown as Record<string, unknown>,
      event as unknown as Record<string, unknown>,
    );
    if (changes) {
      await writeAuditLog(tx as unknown as PrismaClient, {
        entityType: 'event',
        entityId: id,
        action: 'update',
        changes,
        actor: getActor(actorId),
      });
    }

    return event as unknown as Record<string, unknown>;
  });
}

export async function deleteEvent(
  prisma: PrismaClient,
  id: string,
  actorId?: string,
): Promise<void> {
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Event', id);

  await prisma.$transaction(async (tx) => {
    await tx.eventBooking.deleteMany({ where: { eventId: id } });
    await tx.calendarEvent.deleteMany({ where: { eventId: id } });
    await tx.event.delete({ where: { id } });

    await writeAuditLog(tx as unknown as PrismaClient, {
      entityType: 'event',
      entityId: id,
      action: 'delete',
      actor: getActor(actorId),
    });
  });
}

export async function registerGuest(
  prisma: PrismaClient,
  eventId: string,
  guestId: string,
  actorId?: string,
): Promise<Record<string, unknown>> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundError('Event', eventId);

    const guest = await tx.guest.findFirst({ where: { id: guestId, ...notDeleted } });
    if (!guest) throw new NotFoundError('Guest', guestId);

    // Check for existing registration
    const existing = await tx.eventBooking.findUnique({
      where: { eventId_guestId: { eventId, guestId } },
    });

    if (existing) {
      if (existing.status === 'cancelled') {
        // Re-register: count current confirmed to decide status
        const confirmedCount = await tx.eventBooking.count({
          where: { eventId, status: 'confirmed' },
        });
        const newStatus: EventBookingStatus = confirmedCount < event.capacity ? 'confirmed' : 'waitlisted';

        const updated = await tx.eventBooking.update({
          where: { id: existing.id },
          data: { status: newStatus },
        });

        await writeAuditLog(tx as unknown as PrismaClient, {
          entityType: 'event_booking',
          entityId: updated.id,
          action: 'update',
          changes: { status: { from: 'cancelled', to: newStatus } },
          actor: getActor(actorId),
        });

        return updated as unknown as Record<string, unknown>;
      }
      throw new ConflictError('Guest is already registered for this event');
    }

    // New registration
    const confirmedCount = await tx.eventBooking.count({
      where: { eventId, status: 'confirmed' },
    });
    const status: EventBookingStatus = confirmedCount < event.capacity ? 'confirmed' : 'waitlisted';

    const registration = await tx.eventBooking.create({
      data: { eventId, guestId, status },
    });

    await writeAuditLog(tx as unknown as PrismaClient, {
      entityType: 'event_booking',
      entityId: registration.id,
      action: 'create',
      changes: { eventId, guestId, status },
      actor: getActor(actorId),
    });

    return registration as unknown as Record<string, unknown>;
  });
}

export async function listRegistrations(
  prisma: PrismaClient,
  eventId: string,
): Promise<Record<string, unknown>[]> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new NotFoundError('Event', eventId);

  const registrations = await prisma.eventBooking.findMany({
    where: { eventId },
    include: {
      guest: { select: { id: true, name: true, email: true, phone: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return registrations as unknown as Record<string, unknown>[];
}
