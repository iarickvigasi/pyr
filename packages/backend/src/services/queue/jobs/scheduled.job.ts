import type { Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import type { ScheduledJobData } from '@pyr/shared';

/**
 * Scheduled task job processor.
 * Dispatches to morning briefing, guest arrival, and overdue invoice processors.
 * Uses dynamic import to avoid circular dependency with the notification service.
 */
export function createScheduledProcessor(app: FastifyInstance) {
  return async (job: Job<ScheduledJobData>): Promise<void> => {
    app.log.info({ jobId: job.id, taskType: job.data.taskType }, 'Processing scheduled job');

    // Dynamic import to avoid circular deps (consistent with email-poll and ai-draft patterns)
    const { processMorningBriefing, processOverdueInvoiceAlert, processGuestArrivalAlert } =
      await import('../../../modules/notifications/notification.service.js');

    switch (job.data.taskType) {
      case 'morning-briefing':
        return processMorningBriefing(app);
      case 'overdue-invoice-alert':
        return processOverdueInvoiceAlert(app);
      case 'guest-arrival-alert':
        return processGuestArrivalAlert(app);
      default:
        throw new Error(`Unknown scheduled task type: ${(job.data as { taskType: string }).taskType}`);
    }
  };
}
