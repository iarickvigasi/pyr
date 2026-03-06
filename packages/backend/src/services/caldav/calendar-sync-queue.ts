import type { FastifyInstance } from 'fastify';
import { QUEUE_NAMES, type CalendarSyncJobData } from '@pyr/shared';

interface EnqueueCalendarSyncOptions {
  app: FastifyInstance;
  entityType: CalendarSyncJobData['entityType'];
  entityId: string;
  action: CalendarSyncJobData['action'];
  errorLogMessage?: string;
}

/**
 * Enqueue a calendar-sync job. Sync failures are logged and never thrown so
 * primary mutations remain non-blocking.
 */
export async function enqueueCalendarSyncJob(
  options: EnqueueCalendarSyncOptions,
): Promise<void> {
  const { app, entityType, entityId, action, errorLogMessage } = options;

  const calQueue = app.queues?.getQueue(QUEUE_NAMES.CALENDAR_SYNC);
  if (!calQueue) return;

  try {
    await calQueue.add('calendar-sync', {
      entityType,
      entityId,
      action,
    } satisfies CalendarSyncJobData);
  } catch (err) {
    app.log.error(
      { err, entityType, entityId, action },
      errorLogMessage ?? 'Failed to enqueue calendar sync job',
    );
  }
}
