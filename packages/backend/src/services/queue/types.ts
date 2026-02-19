export {
  QUEUE_NAMES,
  type QueueName,
  type EmailPollJobData,
  type AiDraftJobData,
  type CalendarSyncJobData,
  type ScheduledJobData,
  type HealthCheckJobData,
  type DeadLetterJobData,
} from '@pyr/shared';

export interface WorkerRegistration {
  name: string;
  concurrency: number;
}
