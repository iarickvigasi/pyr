/**
 * CalDAV sync service -- pushes bookings and events to Apple Calendar.
 * Data flows ONE WAY: DB -> Apple Calendar. Never read from CalDAV to update DB.
 *
 * Handles create/update/cancel for both bookings and standalone events.
 * Cancelled entities get [CANCELLED] prefix in title (not deleted from calendar).
 * Event updates refresh registration count in title (live-updated).
 *
 * Called by the BullMQ calendar-sync job processor via CalendarModuleContract.
 */

import type { FastifyInstance } from 'fastify';
import { getCaldavClient } from './caldav.client.js';
import { buildBookingVevent, buildEventVevent } from './ical-builder.js';

// ─── Types ──────────────────────────────────────────────────

type SyncAction = 'create' | 'update' | 'delete';

// ─── Booking Sync ───────────────────────────────────────────

/**
 * Sync a booking to Apple Calendar via CalDAV.
 *
 * - create: Creates CalendarEvent record, pushes VEVENT to iCloud
 * - update: Rebuilds VEVENT from current DB data, increments SEQUENCE
 * - delete: Prefixes title with [CANCELLED] (per user decision, not deleted)
 *
 * On CalDAV failure: sets syncStatus='failed' + lastError, re-throws for BullMQ retry.
 */
export async function syncBookingToCalendar(
  app: FastifyInstance,
  bookingId: string,
  action: SyncAction,
): Promise<void> {
  const logger = app.log.child({ bookingId, action, entity: 'booking' });

  // Load booking with relations (bookingGuests junction for multi-guest support)
  const booking = await app.prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      guest: { select: { name: true, email: true, phone: true } },
      bookingGuests: {
        include: { guest: { select: { name: true, email: true, phone: true } } },
      },
      room: {
        select: {
          name: true,
          roomType: { select: { name: true } },
        },
      },
      calendarEvents: true,
    },
  });

  if (!booking) {
    logger.warn('Booking not found -- may have been deleted, skipping sync');
    return;
  }

  const roomName = booking.room?.roomType?.name
    ? `${booking.room.roomType.name} (${booking.room.name})`
    : booking.room?.name ?? 'Unassigned';

  // Derive guest data from junction table (fallback to legacy guest FK)
  const guestNames = booking.bookingGuests.length > 0
    ? booking.bookingGuests.map(bg => bg.guest.name)
    : [booking.guest?.name ?? 'Unknown Guest'];
  const primaryGuest = booking.bookingGuests[0]?.guest ?? booking.guest ?? null;

  // Simple payment status heuristic (no payment model queries for MVP)
  const paymentStatus = booking.totalPrice > 0 ? 'Unpaid' : 'N/A';

  const isCancelled = action === 'delete';

  // Find existing CalendarEvent for this booking
  let calendarEvent = booking.calendarEvents[0] ?? null;

  if (action === 'create' || (!calendarEvent && (action === 'update' || action === 'delete'))) {
    // Create CalendarEvent record if none exists (handles race conditions)
    if (!calendarEvent) {
      calendarEvent = await app.prisma.calendarEvent.create({
        data: {
          bookingId,
          syncStatus: 'pending',
          sequence: 0,
        },
      });
    }

    const uid = `pyr-booking-${calendarEvent.id}`;
    const iCalString = buildBookingVevent({
      uid,
      guestNames,
      roomName,
      guestEmail: primaryGuest?.email ?? null,
      guestPhone: primaryGuest?.phone ?? null,
      totalPrice: booking.totalPrice,
      paymentStatus,
      bookingSource: booking.source,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      isCancelled,
      sequence: calendarEvent.sequence,
    });

    try {
      const { client, calendar } = await getCaldavClient(app.prisma);
      const response = await client.createCalendarObject({
        calendar,
        filename: `${uid}.ics`,
        iCalString,
      });

      // Extract etag from response headers; URL is deterministic (calendar URL + filename)
      const etag = response.headers?.get('etag') ?? null;
      const caldavUrl = `${calendar.url}${uid}.ics`;

      await app.prisma.calendarEvent.update({
        where: { id: calendarEvent.id },
        data: {
          caldavUid: uid,
          caldavUrl,
          etag,
          syncStatus: 'synced',
          lastSynced: new Date(),
          lastError: null,
        },
      });

      logger.info({ calendarEventId: calendarEvent.id }, 'Booking synced to calendar (create)');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await app.prisma.calendarEvent.update({
        where: { id: calendarEvent.id },
        data: { syncStatus: 'failed', lastError: message },
      });
      logger.error({ err }, 'CalDAV create failed for booking');
      throw err;
    }

    return;
  }

  // update or delete with existing CalendarEvent
  if (calendarEvent) {
    const newSequence = calendarEvent.sequence + 1;
    const uid = calendarEvent.caldavUid ?? `pyr-booking-${calendarEvent.id}`;

    const iCalString = buildBookingVevent({
      uid,
      guestNames,
      roomName,
      guestEmail: primaryGuest?.email ?? null,
      guestPhone: primaryGuest?.phone ?? null,
      totalPrice: booking.totalPrice,
      paymentStatus,
      bookingSource: booking.source,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      isCancelled,
      sequence: newSequence,
    });

    try {
      const { client } = await getCaldavClient(app.prisma);
      const calendarObjectUrl = calendarEvent.caldavUrl ?? '';

      await client.updateCalendarObject({
        calendarObject: {
          url: calendarObjectUrl,
          data: iCalString,
          etag: calendarEvent.etag ?? undefined,
        },
      });

      await app.prisma.calendarEvent.update({
        where: { id: calendarEvent.id },
        data: {
          sequence: newSequence,
          syncStatus: 'synced',
          lastSynced: new Date(),
          lastError: null,
        },
      });

      logger.info(
        { calendarEventId: calendarEvent.id, sequence: newSequence },
        `Booking synced to calendar (${action})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await app.prisma.calendarEvent.update({
        where: { id: calendarEvent.id },
        data: { syncStatus: 'failed', lastError: message },
      });
      logger.error({ err }, `CalDAV ${action} failed for booking`);
      throw err;
    }
  }
}

// ─── Event Sync ─────────────────────────────────────────────

/**
 * Sync a standalone event to Apple Calendar via CalDAV.
 *
 * - create: Creates CalendarEvent record, pushes VEVENT with registration count
 * - update: Rebuilds VEVENT from current DB data (refreshes registration count/guest list)
 * - delete: Prefixes title with [CANCELLED] (per user decision, not deleted)
 *
 * On CalDAV failure: sets syncStatus='failed' + lastError, re-throws for BullMQ retry.
 */
export async function syncEventToCalendar(
  app: FastifyInstance,
  eventId: string,
  action: SyncAction,
): Promise<void> {
  const logger = app.log.child({ eventId, action, entity: 'event' });

  // Load event with registrations and calendar events
  const event = await app.prisma.event.findUnique({
    where: { id: eventId },
    include: {
      eventBookings: {
        where: { status: 'confirmed' },
        include: {
          guest: { select: { name: true } },
        },
      },
      calendarEvents: true,
    },
  });

  if (!event) {
    logger.warn('Event not found -- may have been deleted, skipping sync');
    return;
  }

  const confirmedCount = event.eventBookings.length;
  const registeredGuests = event.eventBookings
    .map((eb) => eb.guest.name)
    .filter(Boolean);

  const isCancelled = action === 'delete';

  // Find existing CalendarEvent for this event
  let calendarEvent = event.calendarEvents[0] ?? null;

  if (action === 'create' || (!calendarEvent && (action === 'update' || action === 'delete'))) {
    // Create CalendarEvent record if none exists
    if (!calendarEvent) {
      calendarEvent = await app.prisma.calendarEvent.create({
        data: {
          eventId,
          syncStatus: 'pending',
          sequence: 0,
        },
      });
    }

    const uid = `pyr-event-${calendarEvent.id}`;
    const iCalString = buildEventVevent({
      uid,
      eventType: event.type,
      confirmedCount,
      capacity: event.capacity,
      registeredGuests,
      location: event.location,
      date: event.date,
      time: event.time,
      isCancelled,
      sequence: calendarEvent.sequence,
    });

    try {
      const { client, calendar } = await getCaldavClient(app.prisma);
      const response = await client.createCalendarObject({
        calendar,
        filename: `${uid}.ics`,
        iCalString,
      });

      // Extract etag from response headers; URL is deterministic (calendar URL + filename)
      const etag = response.headers?.get('etag') ?? null;
      const caldavUrl = `${calendar.url}${uid}.ics`;

      await app.prisma.calendarEvent.update({
        where: { id: calendarEvent.id },
        data: {
          caldavUid: uid,
          caldavUrl,
          etag,
          syncStatus: 'synced',
          lastSynced: new Date(),
          lastError: null,
        },
      });

      logger.info({ calendarEventId: calendarEvent.id }, 'Event synced to calendar (create)');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await app.prisma.calendarEvent.update({
        where: { id: calendarEvent.id },
        data: { syncStatus: 'failed', lastError: message },
      });
      logger.error({ err }, 'CalDAV create failed for event');
      throw err;
    }

    return;
  }

  // update or delete with existing CalendarEvent
  if (calendarEvent) {
    const newSequence = calendarEvent.sequence + 1;
    const uid = calendarEvent.caldavUid ?? `pyr-event-${calendarEvent.id}`;

    const iCalString = buildEventVevent({
      uid,
      eventType: event.type,
      confirmedCount,
      capacity: event.capacity,
      registeredGuests,
      location: event.location,
      date: event.date,
      time: event.time,
      isCancelled,
      sequence: newSequence,
    });

    try {
      const { client } = await getCaldavClient(app.prisma);
      const calendarObjectUrl = calendarEvent.caldavUrl ?? '';

      await client.updateCalendarObject({
        calendarObject: {
          url: calendarObjectUrl,
          data: iCalString,
          etag: calendarEvent.etag ?? undefined,
        },
      });

      await app.prisma.calendarEvent.update({
        where: { id: calendarEvent.id },
        data: {
          sequence: newSequence,
          syncStatus: 'synced',
          lastSynced: new Date(),
          lastError: null,
        },
      });

      logger.info(
        { calendarEventId: calendarEvent.id, sequence: newSequence },
        `Event synced to calendar (${action})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await app.prisma.calendarEvent.update({
        where: { id: calendarEvent.id },
        data: { syncStatus: 'failed', lastError: message },
      });
      logger.error({ err }, `CalDAV ${action} failed for event`);
      throw err;
    }
  }
}
