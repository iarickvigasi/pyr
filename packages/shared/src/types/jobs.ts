/** Email poll job -- triggered on schedule, polls IMAP inbox */
export interface EmailPollJobData {
  /** Timestamp of last successful poll, for incremental fetch */
  since?: string;
}

/** AI draft generation job -- triggered by new inbound email */
export interface AiDraftJobData {
  conversationId: string;
  messageId: string;
  guestLanguage: 'en' | 'de';
}

/** Viator event analysis job -- triggered by inbound Viator emails */
export interface ViatorEventAnalysisJobData {
  conversationId: string;
  messageId: string;
}

/** Calendar sync job -- triggered by booking/event mutation */
export interface CalendarSyncJobData {
  entityType: 'booking' | 'event';
  entityId: string;
  action: 'create' | 'update' | 'delete';
}

/** Scheduled task job -- cron-based daily briefing, reminders */
export interface ScheduledJobData {
  taskType: 'morning-briefing' | 'guest-arrival-alert' | 'overdue-invoice-alert';
}

/** Health check job -- verifies queue infrastructure is working */
export interface HealthCheckJobData {
  timestamp: string;
}

/** Dead letter entry -- permanently failed job metadata */
export interface DeadLetterJobData {
  originalQueue: string;
  originalJobId: string;
  originalData: unknown;
  failedReason: string;
  failedAt: string;
  attemptsMade: number;
}

/** Union of all queue names for type-safe queue references */
export const QUEUE_NAMES = {
  EMAIL_POLL: 'email-poll',
  AI_DRAFT: 'ai-draft',
  VIATOR_EVENT_ANALYSIS: 'viator-event-analysis',
  CALENDAR_SYNC: 'calendar-sync',
  SCHEDULED: 'scheduled',
  HEALTH_CHECK: 'health-check',
  DEAD_LETTER: 'dead-letter',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];
