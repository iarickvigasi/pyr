import type { FastifyInstance } from 'fastify';
import type { EmailModuleContract, SendEmailParams } from '@pyr/shared';

/**
 * Email integration module.
 * Provides IMAP polling, email parsing, and SMTP sending.
 * Real implementation: Phase 2 (IMAP/SMTP) and Phase 3 (OTA parsing).
 *
 * Cross-module communication:
 * - Receives: email-poll jobs from BullMQ scheduler
 * - Produces: ai-draft jobs when new guest emails arrive (enqueued to AI module's queue)
 */
export function createEmailModule(app: FastifyInstance): EmailModuleContract {
  return {
    async startPolling() {
      throw new Error('Email module not implemented (Phase 2)');
    },
    async stopPolling() {
      throw new Error('Email module not implemented (Phase 2)');
    },
    async sendEmail(_params: SendEmailParams) {
      throw new Error('Email module not implemented (Phase 2)');
    },
    async healthCheck() {
      app.log.warn('Email module health check: not implemented');
      return { imap: false, smtp: false };
    },
  };
}
