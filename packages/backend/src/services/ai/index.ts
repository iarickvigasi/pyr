import type { FastifyInstance } from 'fastify';
import type { AiModuleContract, GenerateDraftParams } from '@pyr/shared';

/**
 * AI integration module.
 * Provides LLM-powered draft generation, message classification, and context assembly.
 * Real implementation: Phase 4 (AI Communication Engine).
 *
 * Cross-module communication:
 * - Receives: ai-draft jobs from BullMQ (enqueued by email module on new inbound messages)
 * - Produces: Nothing directly (drafts are stored in DB by the job processor for inbox review)
 */
export function createAiModule(app: FastifyInstance): AiModuleContract {
  return {
    async generateDraft(_params: GenerateDraftParams) {
      throw new Error('AI module not implemented (Phase 4)');
    },
    async classifyMessage(_content: string, _metadata?: Record<string, unknown>) {
      throw new Error('AI module not implemented (Phase 4)');
    },
    async healthCheck() {
      app.log.warn('AI module health check: not implemented');
      return { primary: false, fallback: false };
    },
  };
}
