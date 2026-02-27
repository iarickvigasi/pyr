/**
 * AI draft generation BullMQ job processor.
 *
 * Triggered when a new guest email arrives (enqueued by email pipeline).
 * Calls createAiModule to generate a draft reply via OpenClaw.
 * Handles deduplication (skips if draft already exists for the specific message).
 * Exports onFailed handler that writes a failed draft record for frontend detection.
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
      logger.info('AI module initialized for draft generation');
    }

    // Check for existing pending draft for this specific message to avoid duplicates.
    // Only skip for 'pending' -- a 'failed' draft must NOT block a new generation attempt.
    // BullMQ handles job-level dedup; this DB check prevents duplicate pending drafts only.
    const existingDraft = await app.prisma.aiDraft.findFirst({
      where: {
        conversationId,
        messageId,
        status: 'pending',
      },
    });

    if (existingDraft) {
      logger.info({ existingDraftId: existingDraft.id }, 'Pending draft already exists for this message, skipping');
      return;
    }

    try {
      logger.info(
        { gateway: app.gateway?.isConnected ?? false },
        'Starting draft generation',
      );

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

      // Send WhatsApp notification about the new draft (best-effort, never blocks draft job)
      try {
        const conversation = await app.prisma.conversation.findUnique({
          where: { id: conversationId },
          include: { guest: { select: { name: true } } },
        });
        if (conversation?.guest?.name) {
          const { sendDraftReadyNotification } =
            await import('../../../modules/notifications/notification.service.js');
          await sendDraftReadyNotification(app, conversationId, conversation.guest.name);
        }
      } catch (notifErr) {
        logger.error({ err: notifErr }, 'Failed to send draft-ready notification');
      }
    } catch (err) {
      logger.error({ err }, 'AI draft generation failed');
      throw err; // BullMQ will retry (3 attempts, exponential backoff from 3s)
    }
  };
}

/**
 * Factory for BullMQ Worker 'failed' event handler.
 * When all retries are exhausted, writes a failed draft record to the DB
 * so the frontend can detect and surface the failure to Ines.
 */
export function createAiDraftFailedHandler(app: FastifyInstance) {
  return async (job: Job<AiDraftJobData> | undefined, error: Error): Promise<void> => {
    if (!job) {
      app.log.error({ error }, 'AI draft job failed with no job reference');
      return;
    }

    const { conversationId, messageId } = job.data;
    const logger = app.log.child({ jobId: job.id, conversationId });

    logger.error({ error: error.message, messageId }, 'AI draft generation failed after all retries');

    try {
      // Write a failed draft record so the frontend can detect and show the failure notice
      await app.prisma.aiDraft.create({
        data: {
          conversationId,
          messageId: messageId ?? null,
          content: '',
          status: 'failed',
          model: 'none',
          tokensUsed: 0,
          inputTokens: 0,
          outputTokens: 0,
          costEur: 0,
        },
      });
      logger.info('Failed draft record created for frontend detection');
    } catch (dbErr) {
      logger.error({ error: dbErr }, 'Could not write failed draft record');
    }
  };
}
