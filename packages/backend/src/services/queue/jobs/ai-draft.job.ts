/**
 * AI draft generation BullMQ job processor.
 *
 * Triggered when a new guest email arrives (enqueued by email pipeline).
 * Calls createAiModule to generate a draft reply via OpenClaw.
 * Handles deduplication (skips if pending draft already exists for the conversation).
 */

import type { Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import type { AiDraftJobData, AiModuleContract } from '@pyr/shared';

export function createAiDraftProcessor(app: FastifyInstance) {
  let aiModule: AiModuleContract | null = null;

  return async (job: Job<AiDraftJobData>): Promise<void> => {
    const { conversationId, messageId, guestLanguage } = job.data;
    const logger = app.log.child({ jobId: job.id, conversationId });

    logger.info({ messageId, guestLanguage }, 'Processing AI draft generation job');

    // Lazy init via dynamic import (avoids circular dependency, consistent with email-poll pattern)
    if (!aiModule) {
      const { createAiModule } = await import('../../ai/index.js');
      aiModule = createAiModule(app);
    }

    // Check for existing pending draft to avoid duplicates
    const existingDraft = await app.prisma.aiDraft.findFirst({
      where: {
        conversationId,
        status: 'pending',
      },
    });

    if (existingDraft) {
      logger.info({ existingDraftId: existingDraft.id }, 'Pending draft already exists, skipping');
      return;
    }

    try {
      const result = await aiModule!.generateDraft({
        conversationId,
        messageId,
        messageContent: '', // draft-generator fetches from DB
        guestLanguage,
      });

      logger.info(
        {
          model: result.model,
          tokensUsed: result.tokensUsed,
          costEur: result.costEur,
        },
        'AI draft generated successfully',
      );
    } catch (err) {
      logger.error({ err }, 'AI draft generation failed');
      throw err; // BullMQ will retry (3 attempts, exponential backoff from 3s)
    }
  };
}
