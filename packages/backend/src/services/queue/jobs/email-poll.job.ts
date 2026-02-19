import type { Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import type { EmailPollJobData } from '@pyr/shared';

/**
 * Email poll job processor -- placeholder for Phase 2 (Email Ingestion).
 * Polls IMAP inbox for new emails and creates conversations/messages.
 * Throws if accidentally triggered before implementation.
 */
export function createEmailPollProcessor(app: FastifyInstance) {
  return async (job: Job<EmailPollJobData>): Promise<void> => {
    app.log.info({ jobId: job.id, data: job.data }, 'Email poll job received');
    throw new Error('Email poll processor not implemented (Phase 2 -- Email Ingestion)');
  };
}
