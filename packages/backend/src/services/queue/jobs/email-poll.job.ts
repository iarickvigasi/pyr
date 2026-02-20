import type { Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import type { EmailPollJobData } from '@pyr/shared';

/**
 * Email poll job processor.
 * Polls IMAP inbox for new emails via the email module pipeline.
 * The email module is lazily imported and created on first invocation,
 * reused for subsequent polls within the same worker lifecycle.
 *
 * Uses dynamic import to avoid top-level transitive loading of the email
 * module (which imports IMAP, SMTP, parser, classifier, audit modules) in
 * test environments where workers are not registered.
 */
export function createEmailPollProcessor(app: FastifyInstance) {
  let emailModule: { pollInbox(): Promise<number> } | null = null;

  return async (job: Job<EmailPollJobData>): Promise<void> => {
    if (!emailModule) {
      const { createEmailModule } = await import('../../email/index.js');
      emailModule = createEmailModule(app);
    }

    app.log.info({ jobId: job.id }, 'Starting email poll');

    const processed = await emailModule.pollInbox();

    app.log.info({ jobId: job.id, processed }, 'Email poll complete');
  };
}
