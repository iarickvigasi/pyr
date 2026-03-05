import type { FastifyInstance } from 'fastify';
import { QUEUE_NAMES } from '@pyr/shared';
import type {
  EmailPollJobData,
  AiDraftJobData,
  ViatorEventAnalysisJobData,
  CalendarSyncJobData,
  ScheduledJobData,
  HealthCheckJobData,
  DeadLetterJobData,
} from '@pyr/shared';

/**
 * Register all application queues with appropriate retry strategies.
 * Must be called after the queue plugin is registered.
 */
export async function registerQueues(app: FastifyInstance): Promise<void> {
  // Dead letter queue (no special retry -- just stores failed jobs)
  app.queues.createQueue<DeadLetterJobData>(QUEUE_NAMES.DEAD_LETTER);

  // Email poll -- 3 attempts, exponential backoff from 5s (5s, 10s, 20s)
  app.queues.createQueue<EmailPollJobData>(QUEUE_NAMES.EMAIL_POLL, {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });

  // AI draft -- 3 attempts, exponential backoff from 3s (3s, 6s, 12s)
  app.queues.createQueue<AiDraftJobData>(QUEUE_NAMES.AI_DRAFT, {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });

  // Viator event analysis -- 3 attempts, exponential backoff from 3s
  app.queues.createQueue<ViatorEventAnalysisJobData>(QUEUE_NAMES.VIATOR_EVENT_ANALYSIS, {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    },
  });

  // Calendar sync -- 5 attempts, exponential backoff from 2s (2s, 4s, 8s, 16s, 32s)
  app.queues.createQueue<CalendarSyncJobData>(QUEUE_NAMES.CALENDAR_SYNC, {
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    },
  });

  // Scheduled tasks -- 2 attempts, fixed 30s backoff
  app.queues.createQueue<ScheduledJobData>(QUEUE_NAMES.SCHEDULED, {
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'fixed', delay: 30000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  });

  // Health check -- 1 attempt, no retry (failure IS the diagnostic)
  app.queues.createQueue<HealthCheckJobData>(QUEUE_NAMES.HEALTH_CHECK, {
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  });
}
