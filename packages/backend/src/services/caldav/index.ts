import type { FastifyInstance } from 'fastify';
import type { CalendarModuleContract } from '@pyr/shared';

/**
 * CalDAV integration module.
 * Pushes bookings and events to Apple Calendar via CalDAV protocol.
 * Real implementation: Phase 6 (Calendar & Apple Calendar Sync).
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
    async syncBooking(_bookingId: string, _action: 'create' | 'update' | 'delete') {
      throw new Error('CalDAV module not implemented (Phase 6)');
    },
    async syncEvent(_eventId: string, _action: 'create' | 'update' | 'delete') {
      throw new Error('CalDAV module not implemented (Phase 6)');
    },
    async healthCheck() {
      app.log.warn('CalDAV module health check: not implemented');
      return { caldav: false };
    },
  };
}
