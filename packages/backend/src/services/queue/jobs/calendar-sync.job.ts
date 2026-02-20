/**
 * Calendar sync BullMQ job processor.
 *
 * Triggered when a booking or event is created, updated, or cancelled.
 * Dispatches to the CalDAV module sync functions by entity type.
 * Uses lazy module initialization (same pattern as ai-draft.job.ts).
 */

import type { Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import type { CalendarSyncJobData, CalendarModuleContract } from '@pyr/shared';

export function createCalendarSyncProcessor(app: FastifyInstance) {
  let caldavModule: CalendarModuleContract | null = null;

  return async (job: Job<CalendarSyncJobData>): Promise<void> => {
    const { entityType, entityId, action } = job.data;
    const logger = app.log.child({ jobId: job.id, entityType, entityId, action });

    logger.info('Processing calendar sync job');

    // Lazy init via dynamic import (avoids circular dependency, consistent with ai-draft pattern)
    if (!caldavModule) {
      const { createCaldavModule } = await import('../../caldav/index.js');
      caldavModule = createCaldavModule(app);
    }

    if (entityType === 'booking') {
      await caldavModule.syncBooking(entityId, action);
    } else if (entityType === 'event') {
      await caldavModule.syncEvent(entityId, action);
    } else {
      logger.warn({ entityType }, 'Unknown entity type in calendar sync job');
    }

    logger.info('Calendar sync job completed');
  };
}
