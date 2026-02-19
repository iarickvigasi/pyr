import type { Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import type { AiDraftJobData } from '@pyr/shared';

/**
 * AI draft generation job processor -- placeholder for Phase 4 (AI Communication Engine).
 * Generates AI-drafted replies for incoming messages.
 * Throws if accidentally triggered before implementation.
 */
export function createAiDraftProcessor(app: FastifyInstance) {
  return async (job: Job<AiDraftJobData>): Promise<void> => {
    app.log.info({ jobId: job.id, data: job.data }, 'AI draft job received');
    throw new Error('AI draft processor not implemented (Phase 4 -- AI Communication Engine)');
  };
}
