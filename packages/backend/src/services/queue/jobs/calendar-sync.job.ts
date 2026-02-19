import type { Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import type { CalendarSyncJobData } from '@pyr/shared';

/**
 * Calendar sync job processor -- placeholder for Phase 6 (Calendar & Apple Calendar Sync).
 * Pushes booking/event changes to Apple Calendar via CalDAV.
 * Throws if accidentally triggered before implementation.
 */
export function createCalendarSyncProcessor(app: FastifyInstance) {
  return async (job: Job<CalendarSyncJobData>): Promise<void> => {
    app.log.info({ jobId: job.id, data: job.data }, 'Calendar sync job received');
    throw new Error('Calendar sync processor not implemented (Phase 6 -- Calendar & Apple Calendar Sync)');
  };
}
