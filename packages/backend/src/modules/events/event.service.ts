import type { PrismaClient, EventType, EventBookingStatus, Prisma } from '@prisma/client';
import type { PaginatedResult } from '../../lib/pagination.js';
import { clampLimit } from '../../lib/pagination.js';
import { notDeleted, computeChanges } from '../../lib/prisma-helpers.js';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { NotFoundError, ConflictError } from '../../lib/errors.js';
import type { CreateEventBody, UpdateEventBody, ListEventsQuery } from './event.schema.js';
import type { Event, EventWithBookings, EventBooking } from '../../types/entities.js';

export async function listEvents(
  prisma: PrismaClient,
  query: ListEventsQuery,
): Promise<PaginatedResult<Event & { _count: { eventBookings: number } }>> {
  const limit = clampLimit(query.limit);
  const where: Prisma.EventWhereInput = {};

  if (query.type) where.type = query.type as EventType;
  if (query.from) {
    where.date = { gte: new Date(query.from) };
  }
  if (query.to) {
    where.date = {
      ...(where.date as Prisma.DateTimeFilter | undefined ?? {}),
      lte: new Date(query.to),
    };
  }

  const events = await prisma.event.findMany({
    where,
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
    data: data as (Event & { _count: { eventBookings: number } })[],
    nextCursor: hasMore ? data[data.length - 1]!.id : null,
    hasMore,
  };
}

export async function getEvent(
  prisma: PrismaClient,
  id: string,
): Promise<EventWithBookings> {
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
  return event as EventWithBookings;
}

export async function createEvent(
  prisma: PrismaClient,
  data: CreateEventBody,
  actorId?: string,
): Promise<Event> {
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

    await writeAuditLog(tx, {
      entityType: 'event',
      entityId: event.id,
      action: 'create',
      changes: data as unknown as Record<string, unknown>,
      actor: getActor(actorId),
    });

    return event as Event;
  });
}

export async function updateEvent(
  prisma: PrismaClient,
  id: string,
  data: UpdateEventBody,
  actorId?: string,
): Promise<Event> {
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
      await writeAuditLog(tx, {
        entityType: 'event',
        entityId: id,
        action: 'update',
        changes,
        actor: getActor(actorId),
      });
    }

    return event as Event;
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

    await writeAuditLog(tx, {
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
): Promise<EventBooking> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundError('Event', eventId);

    const guest = await tx.guest.findFirst({ where: { id: guestId, ...notDeleted } });
    if (!guest) throw new NotFoundError('Guest', guestId);

    // Check for existing registration and capacity in parallel
    const [existing, confirmedCount] = await Promise.all([
      tx.eventBooking.findUnique({ where: { eventId_guestId: { eventId, guestId } } }),
      tx.eventBooking.count({ where: { eventId, status: 'confirmed' } }),
    ]);

    if (existing) {
      if (existing.status === 'cancelled') {
        // Re-register: use the already-fetched confirmedCount
        const newStatus: EventBookingStatus =
          confirmedCount < event.capacity ? 'confirmed' : 'waitlisted';

        const updated = await tx.eventBooking.update({
          where: { id: existing.id },
          data: { status: newStatus },
        });

        await writeAuditLog(tx, {
          entityType: 'event_booking',
          entityId: updated.id,
          action: 'update',
          changes: { status: { from: 'cancelled', to: newStatus } },
          actor: getActor(actorId),
        });

        return updated as EventBooking;
      }
      throw new ConflictError('Guest is already registered for this event');
    }

    // New registration
    const status: EventBookingStatus =
      confirmedCount < event.capacity ? 'confirmed' : 'waitlisted';

    const registration = await tx.eventBooking.create({
      data: { eventId, guestId, status },
    });

    await writeAuditLog(tx, {
      entityType: 'event_booking',
      entityId: registration.id,
      action: 'create',
      changes: { eventId, guestId, status },
      actor: getActor(actorId),
    });

    return registration as EventBooking;
  });
}

export async function listRegistrations(
  prisma: PrismaClient,
  eventId: string,
): Promise<(EventBooking & { guest: { id: string; name: string; email: string | null; phone: string | null } })[]> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new NotFoundError('Event', eventId);

  const registrations = await prisma.eventBooking.findMany({
    where: { eventId },
    include: {
      guest: { select: { id: true, name: true, email: true, phone: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return registrations as (EventBooking & { guest: { id: string; name: string; email: string | null; phone: string | null } })[];
}
