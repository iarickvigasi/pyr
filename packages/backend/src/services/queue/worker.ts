import type { FastifyInstance } from 'fastify';
import { QUEUE_NAMES } from '@pyr/shared';
import type { HealthCheckJobData } from '@pyr/shared';
import { createHealthCheckProcessor } from './jobs/health-check.job.js';
import { createEmailPollProcessor } from './jobs/email-poll.job.js';
import { createAiDraftProcessor } from './jobs/ai-draft.job.js';
import { createCalendarSyncProcessor } from './jobs/calendar-sync.job.js';
import { createScheduledProcessor } from './jobs/scheduled.job.js';
import { getSetting } from '../../modules/settings/settings.service.js';

/**
 * Register all application workers.
 * Must be called after registerQueues().
 */
export async function registerWorkers(app: FastifyInstance): Promise<void> {
  // Health check worker -- concurrency 1
  app.queues.createWorker(
    QUEUE_NAMES.HEALTH_CHECK,
    createHealthCheckProcessor(app),
    { concurrency: 1 },
  );

  // Placeholder workers -- will fail loudly if accidentally triggered
  app.queues.createWorker(
    QUEUE_NAMES.EMAIL_POLL,
    createEmailPollProcessor(app),
    { concurrency: 1 },
  );

  app.queues.createWorker(
    QUEUE_NAMES.AI_DRAFT,
    createAiDraftProcessor(app),
    { concurrency: 1 },
  );

  app.queues.createWorker(
    QUEUE_NAMES.CALENDAR_SYNC,
    createCalendarSyncProcessor(app),
    { concurrency: 1 },
  );

  app.queues.createWorker(
    QUEUE_NAMES.SCHEDULED,
    createScheduledProcessor(app),
    { concurrency: 1 },
  );
}

/**
 * Set up Job Schedulers for recurring jobs.
 * Reads configurable intervals from the settings table with sensible defaults.
 * Uses upsertJobScheduler (idempotent -- safe to call on every server start).
 */
export async function setupSchedulers(app: FastifyInstance): Promise<void> {
  // Read configurable interval from settings table, fallback to 5 minutes
  let healthCheckIntervalMs = 300_000;
  try {
    const setting = await getSetting(app.prisma, 'health_check_interval_ms');
    const parsed = Number(setting.value);
    if (!Number.isNaN(parsed) && parsed >= 10_000) {
      healthCheckIntervalMs = parsed;
    } else {
      app.log.warn({ value: setting.value }, 'Invalid health_check_interval_ms setting, using default');
    }
  } catch {
    // Setting not found -- use default. This is expected on first run.
    app.log.info('health_check_interval_ms setting not found, using default (300000ms)');
  }

  const healthCheckQueue = app.queues.getQueue(QUEUE_NAMES.HEALTH_CHECK);
  if (healthCheckQueue) {
    await healthCheckQueue.upsertJobScheduler('health-check-scheduler', {
      every: healthCheckIntervalMs,
    }, {
      name: 'health-check',
      data: { timestamp: new Date().toISOString() } satisfies HealthCheckJobData,
    });
    app.log.info({ intervalMs: healthCheckIntervalMs }, 'Health check scheduler registered');
  }
}
