import type { FastifyInstance } from 'fastify';
import type { CalendarModuleContract } from '@pyr/shared';
import { syncBookingToCalendar, syncEventToCalendar } from './caldav.service.js';
import { getCaldavClient } from './caldav.client.js';

/**
 * CalDAV integration module.
 * Pushes bookings and events to Apple Calendar via CalDAV protocol.
 *
 * Cross-module communication:
 * - Receives: calendar-sync jobs from BullMQ (enqueued by booking/event mutations)
 * - Produces: Nothing (sync is terminal -- pushes to Apple Calendar, one-way)
 *
 * Business rule: Data flows ONE WAY -- DB to Apple Calendar. Never read from
 * CalDAV to update DB.
 */
export function createCaldavModule(app: FastifyInstance): CalendarModuleContract {
  return {
    async syncBooking(bookingId: string, action: 'create' | 'update' | 'delete') {
      await syncBookingToCalendar(app, bookingId, action);
    },
    async syncEvent(eventId: string, action: 'create' | 'update' | 'delete') {
      await syncEventToCalendar(app, eventId, action);
    },
    async healthCheck() {
      try {
        await getCaldavClient(app.prisma);
        return { caldav: true };
      } catch {
        return { caldav: false };
      }
    },
  };
}
