/**
 * AI integration module -- AiModuleContract implementation.
 *
 * Bridges the email module to OpenClaw via the contract interface.
 * Cross-module communication:
 * - Receives: ai-draft jobs from BullMQ (enqueued by email module on new inbound messages)
 * - Produces: AiDraft records in DB (for inbox review by Ines)
 */

import type { FastifyInstance } from 'fastify';
import type { AiModuleContract } from '@pyr/shared';
import { classifyEdgeCases } from './classifier.js';
import { generateDraft } from './draft-generator.js';

export function createAiModule(app: FastifyInstance): AiModuleContract {
  const config = app.config;
  const logger = app.log.child({ module: 'ai' });

  return {
    async generateDraft(params) {
      const result = await generateDraft({
        prisma: app.prisma,
        config: {
          openclawGatewayUrl: config.OPENCLAW_GATEWAY_URL,
          openclawGatewayToken: config.OPENCLAW_GATEWAY_TOKEN,
        },
        conversationId: params.conversationId,
        messageId: params.messageId,
        guestLanguage: params.guestLanguage,
        logger,
      });
      return {
        content: result.content,
        model: result.model,
        tokensUsed: { input: result.inputTokens, output: result.outputTokens },
        costEur: result.costEur,
      };
    },

    async classifyMessage(content, _metadata) {
      const flags = classifyEdgeCases(content);
      return {
        category: 'guest-inquiry',
        confidence: flags.length > 0 ? 0.8 : 0.6,
        flags,
      };
    },

    async healthCheck() {
      // WebSocket connection state is the health indicator.
      // OpenClaw Gateway handles provider failover internally --
      // if connected, both primary and fallback are considered available.
      const connected = app.gateway?.isConnected ?? false;
      return { primary: connected, fallback: connected };
    },
  };
}
