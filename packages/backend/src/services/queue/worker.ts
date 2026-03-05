import type { FastifyInstance } from 'fastify';
import { QUEUE_NAMES } from '@pyr/shared';
import type { HealthCheckJobData, EmailPollJobData, ScheduledJobData } from '@pyr/shared';
import { createHealthCheckProcessor } from './jobs/health-check.job.js';
import { createEmailPollProcessor } from './jobs/email-poll.job.js';
import { createAiDraftProcessor, createAiDraftFailedHandler } from './jobs/ai-draft.job.js';
import { createInboxTelegramNotifyProcessor } from './jobs/inbox-telegram-notify.job.js';
import { createViatorEventAnalysisProcessor } from './jobs/viator-event-analysis.job.js';
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

  // Email poll worker -- polls IMAP inbox via email module pipeline
  app.queues.createWorker(
    QUEUE_NAMES.EMAIL_POLL,
    createEmailPollProcessor(app),
    { concurrency: 1 },
  );

  // AI draft worker -- generates AI draft replies for guest emails
  const aiDraftWorker = app.queues.createWorker(
    QUEUE_NAMES.AI_DRAFT,
    createAiDraftProcessor(app),
    { concurrency: 1 },
  );
  aiDraftWorker.on('failed', createAiDraftFailedHandler(app));

  app.queues.createWorker(
    QUEUE_NAMES.INBOX_TELEGRAM_NOTIFY,
    createInboxTelegramNotifyProcessor(app),
    { concurrency: 2 },
  );

  app.queues.createWorker(
    QUEUE_NAMES.VIATOR_EVENT_ANALYSIS,
    createViatorEventAnalysisProcessor(app),
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

  // Email poll scheduler -- polls IMAP inbox every 2 minutes (configurable)
  let emailPollIntervalMs = 120_000;
  try {
    const setting = await getSetting(app.prisma, 'email_poll_interval_ms');
    const parsed = Number(setting.value);
    if (!Number.isNaN(parsed) && parsed >= 30_000) {
      emailPollIntervalMs = parsed;
    }
  } catch {
    app.log.info('email_poll_interval_ms setting not found, using default (120000ms)');
  }

  const emailPollQueue = app.queues.getQueue(QUEUE_NAMES.EMAIL_POLL);
  if (emailPollQueue) {
    await emailPollQueue.upsertJobScheduler('email-poll-scheduler', {
      every: emailPollIntervalMs,
    }, {
      name: 'email-poll',
      data: {} satisfies EmailPollJobData,
    });
    app.log.info({ intervalMs: emailPollIntervalMs }, 'Email poll scheduler registered');
  }

  // --- Scheduled task schedulers (morning briefing, guest arrival, overdue invoice) ---

  const scheduledQueue = app.queues.getQueue(QUEUE_NAMES.SCHEDULED);
  if (scheduledQueue) {
    // Morning briefing -- configurable time, default 07:30 Cyprus time
    let briefingTime = '07:30';
    try {
      const setting = await getSetting(app.prisma, 'morning_briefing_time');
      if (typeof setting.value === 'string' && /^\d{2}:\d{2}$/.test(setting.value)) {
        briefingTime = setting.value;
      }
    } catch {
      app.log.info('morning_briefing_time setting not found, using default (07:30)');
    }

    const [briefingHours, briefingMinutes] = briefingTime.split(':').map(Number) as [number, number];

    await scheduledQueue.upsertJobScheduler('morning-briefing-scheduler', {
      pattern: `${briefingMinutes} ${briefingHours} * * *`,
      tz: 'Europe/Nicosia',
    }, {
      name: 'scheduled',
      data: { taskType: 'morning-briefing' } satisfies ScheduledJobData,
    });
    app.log.info({ time: briefingTime, tz: 'Europe/Nicosia' }, 'Morning briefing scheduler registered');

    // Guest arrival alert -- 5 minutes after morning briefing
    const arrivalMinutes = briefingMinutes + 5;
    const arrivalHours = arrivalMinutes >= 60 ? briefingHours + 1 : briefingHours;
    const arrivalMin = arrivalMinutes >= 60 ? arrivalMinutes - 60 : arrivalMinutes;

    await scheduledQueue.upsertJobScheduler('guest-arrival-scheduler', {
      pattern: `${arrivalMin} ${arrivalHours} * * *`,
      tz: 'Europe/Nicosia',
    }, {
      name: 'scheduled',
      data: { taskType: 'guest-arrival-alert' } satisfies ScheduledJobData,
    });
    app.log.info({ time: `${String(arrivalHours).padStart(2, '0')}:${String(arrivalMin).padStart(2, '0')}` }, 'Guest arrival scheduler registered');

    // Overdue invoice check -- daily at 9:00 AM Cyprus time
    await scheduledQueue.upsertJobScheduler('overdue-invoice-scheduler', {
      pattern: '0 9 * * *',
      tz: 'Europe/Nicosia',
    }, {
      name: 'scheduled',
      data: { taskType: 'overdue-invoice-alert' } satisfies ScheduledJobData,
    });
    app.log.info('Overdue invoice scheduler registered (09:00 Europe/Nicosia)');
  }
}
