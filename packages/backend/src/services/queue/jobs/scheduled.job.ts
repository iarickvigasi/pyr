import type { Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import type { ScheduledJobData } from '@pyr/shared';

/**
 * Scheduled task job processor -- placeholder for Phase 8 (AI Assistant Actions & Automation).
 * Handles daily briefings, pre-arrival reminders, and overdue invoice alerts.
 * Throws if accidentally triggered before implementation.
 */
export function createScheduledProcessor(app: FastifyInstance) {
  return async (job: Job<ScheduledJobData>): Promise<void> => {
    app.log.info({ jobId: job.id, data: job.data }, 'Scheduled job received');
    throw new Error('Scheduled task processor not implemented (Phase 8 -- AI Assistant Actions & Automation)');
  };
}
