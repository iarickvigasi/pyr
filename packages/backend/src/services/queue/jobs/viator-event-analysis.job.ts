import type { Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import type { ViatorEventAnalysisJobData } from '@pyr/shared';
import { runConversationEventAnalysis } from '../../../modules/inbox/conversation-event.service.js';

export function createViatorEventAnalysisProcessor(app: FastifyInstance) {
  return async (job: Job<ViatorEventAnalysisJobData>): Promise<void> => {
    const { conversationId, messageId } = job.data;
    const logger = app.log.child({ queue: 'viator-event-analysis', jobId: job.id, conversationId, messageId });

    logger.info('viator_analysis_started');
    try {
      await runConversationEventAnalysis(app.prisma, app, conversationId, messageId);
      logger.info('viator_analysis_completed');
    } catch (err) {
      logger.error({ err }, 'viator_analysis_failed');
      throw err;
    }
  };
}
