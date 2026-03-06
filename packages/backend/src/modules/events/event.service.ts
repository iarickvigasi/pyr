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
  });

  const hasMore = events.length > limit;
  const data = hasMore ? events.slice(0, limit) : events;

  const eventIds = data.map((event) => event.id);
  const attendeeSums = eventIds.length > 0
    ? await prisma.eventBooking.groupBy({
        by: ['eventId'],
        where: {
          eventId: { in: eventIds },
          status: 'confirmed',
        },
        _sum: { attendeeCount: true },
      })
    : [];
  const attendeeSumByEventId = new Map(
    attendeeSums.map((row) => [row.eventId, row._sum.attendeeCount ?? 0]),
  );
  const dataWithCounts = data.map((event) => ({
    ...event,
    _count: {
      eventBookings: attendeeSumByEventId.get(event.id) ?? 0,
    },
  }));

  return {
    data: dataWithCounts as (Event & { _count: { eventBookings: number } })[],
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
  const confirmedAttendees = event.eventBookings
    .filter((row) => row.status === 'confirmed')
    .reduce((sum, row) => sum + row.attendeeCount, 0);

  return {
    ...event,
    _count: {
      eventBookings: confirmedAttendees,
    },
  } as unknown as EventWithBookings;
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
  await prisma.$transaction(async (tx) => {
    const existing = await tx.event.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Event', id);

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
  options?: {
    attendeeCount?: number;
    externalProvider?: string | null;
    externalBookingId?: string | null;
    externalProductCode?: string | null;
    sourceConversationId?: string | null;
  },
): Promise<EventBooking> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundError('Event', eventId);

    const guest = await tx.guest.findFirst({ where: { id: guestId, ...notDeleted } });
    if (!guest) throw new NotFoundError('Guest', guestId);

    const requestedAttendeeCount = options?.attendeeCount ?? 1;
    const attendeeCount = Number.isFinite(requestedAttendeeCount)
      ? Math.max(1, Math.floor(requestedAttendeeCount))
      : 1;

    // Check for existing registration and confirmed attendee volume in parallel
    const [existing, confirmedAttendeeVolume] = await Promise.all([
      tx.eventBooking.findUnique({ where: { eventId_guestId: { eventId, guestId } } }),
      tx.eventBooking.aggregate({
        where: { eventId, status: 'confirmed' },
        _sum: { attendeeCount: true },
      }),
    ]);
    const confirmedAttendees = confirmedAttendeeVolume._sum.attendeeCount ?? 0;

    if (existing) {
      if (existing.status === 'cancelled') {
        // Re-register: use the already-fetched confirmedCount
        const newStatus: EventBookingStatus =
          (confirmedAttendees + attendeeCount) <= event.capacity ? 'confirmed' : 'waitlisted';

        const updated = await tx.eventBooking.update({
          where: { id: existing.id },
          data: {
            status: newStatus,
            attendeeCount,
            externalProvider: options?.externalProvider ?? existing.externalProvider,
            externalBookingId: options?.externalBookingId ?? existing.externalBookingId,
            externalProductCode: options?.externalProductCode ?? existing.externalProductCode,
            sourceConversationId: options?.sourceConversationId ?? existing.sourceConversationId,
          },
        });

        await writeAuditLog(tx, {
          entityType: 'event_booking',
          entityId: updated.id,
          action: 'update',
          changes: {
            status: { from: 'cancelled', to: newStatus },
            attendeeCount,
            externalProvider: options?.externalProvider ?? existing.externalProvider,
            externalBookingId: options?.externalBookingId ?? existing.externalBookingId,
            externalProductCode: options?.externalProductCode ?? existing.externalProductCode,
            sourceConversationId: options?.sourceConversationId ?? existing.sourceConversationId,
          },
          actor: getActor(actorId),
        });

        return updated as EventBooking;
      }
      throw new ConflictError('Guest is already registered for this event');
    }

    // New registration
    const status: EventBookingStatus =
      (confirmedAttendees + attendeeCount) <= event.capacity ? 'confirmed' : 'waitlisted';

    const registration = await tx.eventBooking.create({
      data: {
        eventId,
        guestId,
        status,
        attendeeCount,
        externalProvider: options?.externalProvider ?? null,
        externalBookingId: options?.externalBookingId ?? null,
        externalProductCode: options?.externalProductCode ?? null,
        sourceConversationId: options?.sourceConversationId ?? null,
      },
    });

    await writeAuditLog(tx, {
      entityType: 'event_booking',
      entityId: registration.id,
      action: 'create',
      changes: {
        eventId,
        guestId,
        status,
        attendeeCount,
        externalProvider: options?.externalProvider ?? null,
        externalBookingId: options?.externalBookingId ?? null,
        externalProductCode: options?.externalProductCode ?? null,
        sourceConversationId: options?.sourceConversationId ?? null,
      },
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

export async function cancelEventRegistration(
  prisma: PrismaClient,
  eventId: string,
  registrationId: string,
  actorId?: string,
): Promise<EventBooking & { guest: { id: string; name: string; email: string | null; phone: string | null } }> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundError('Event', eventId);

    const existing = await tx.eventBooking.findFirst({
      where: { id: registrationId, eventId },
      include: {
        guest: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    if (!existing) throw new NotFoundError('Event registration', registrationId);

    if (existing.status === 'cancelled') {
      return existing as EventBooking & { guest: { id: string; name: string; email: string | null; phone: string | null } };
    }

    const updated = await tx.eventBooking.update({
      where: { id: registrationId },
      data: { status: 'cancelled' },
      include: {
        guest: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    await writeAuditLog(tx, {
      entityType: 'event_booking',
      entityId: registrationId,
      action: 'update',
      changes: {
        status: {
          from: existing.status,
          to: 'cancelled',
        },
      },
      actor: getActor(actorId),
    });

    return updated as EventBooking & { guest: { id: string; name: string; email: string | null; phone: string | null } };
  });
}
