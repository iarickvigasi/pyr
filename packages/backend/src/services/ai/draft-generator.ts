/**
 * AI draft generator -- orchestrates context building, OpenClaw HTTP API call,
 * edge-case classification, cost calculation, and DB write.
 *
 * The draft generator calls OpenClaw's OpenAI-compatible HTTP API at
 * POST /v1/chat/completions. OpenClaw handles model selection (Claude primary,
 * OpenAI fallback), prompt caching, and provider failover. The backend only
 * reads the usage data from the response.
 *
 * No direct LLM SDK imports -- all AI calls go through OpenClaw.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { buildDraftContext } from './context-builder.js';
import { buildSystemPrompt } from './prompts/system.js';
import { classifyEdgeCases } from './classifier.js';
import { calculateCost } from './cost-calculator.js';
import { writeAuditLog } from '../../lib/audit.js';

// ─── Types ───────────────────────────────────────────────

export interface GenerateDraftResult {
  draftId: string;
  content: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costEur: number; // microcents (EUR * 100,000)
  durationMs: number;
  flags: string[]; // edge case flags
}

export interface GenerateDraftParams {
  prisma: PrismaClient;
  config: {
    openclawGatewayUrl: string;
    openclawGatewayToken: string;
  };
  conversationId: string;
  messageId: string;
  guestLanguage: 'en' | 'de';
  logger: FastifyBaseLogger;
}

/** OpenAI-compatible chat completion response from OpenClaw Gateway */
interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

// ─── Constants ──────────────────────────────────────────

/** Maximum number of conversation messages to include in the prompt */
const MAX_MESSAGES = 20;

// ─── Public API ─────────────────────────────────────────

/**
 * Generate an AI draft reply for a conversation message.
 *
 * Steps:
 * 1. Build business context (guest, bookings, availability, events)
 * 2. Assemble system prompt with brand voice and guardrails
 * 3. Classify the latest inbound message for edge cases
 * 4. Build conversation message history (capped at 20)
 * 5. Call OpenClaw's HTTP API (POST /v1/chat/completions)
 * 6. Calculate cost from token usage
 * 7. Write AiDraft record and audit log in a transaction
 *
 * @throws If conversation/message not found or OpenClaw API returns non-2xx
 */
export async function generateDraft(params: GenerateDraftParams): Promise<GenerateDraftResult> {
  const { prisma, config, conversationId, messageId, guestLanguage, logger } = params;

  // 1. Build business context
  const context = await buildDraftContext(prisma, conversationId);

  // 2. Assemble system prompt
  const systemPrompt = buildSystemPrompt(context, guestLanguage);

  // 3. Get the latest inbound message content for edge-case classification
  const latestInbound = [...context.conversation.messages]
    .reverse()
    .find((m) => m.direction === 'in');

  const messageContent = latestInbound?.content ?? '';

  // 4. Classify edge cases
  const flags = classifyEdgeCases(messageContent);

  // 5. Build chat messages array (cap at last MAX_MESSAGES)
  const recentMessages = context.conversation.messages.slice(-MAX_MESSAGES);
  const chatMessages = recentMessages.map((m) => ({
    role: m.direction === 'in' ? ('user' as const) : ('assistant' as const),
    content: m.content,
  }));

  // 6. Call OpenClaw's HTTP API
  const startTime = Date.now();
  const response = await fetch(`${config.openclawGatewayUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.openclawGatewayToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openclaw:main',
      messages: [
        { role: 'system', content: systemPrompt },
        ...chatMessages,
      ],
      max_tokens: 2048,
      temperature: 0.5,
    }),
  });
  const durationMs = Date.now() - startTime;

  if (!response.ok) {
    const body = await response.text().catch(() => 'Unable to read response body');
    throw new Error(`OpenClaw API error: ${response.status} ${response.statusText} - ${body}`);
  }

  const completion = (await response.json()) as ChatCompletionResponse;

  const draftContent = completion.choices[0]?.message?.content;
  if (!draftContent) {
    throw new Error('OpenClaw API returned empty response (no choices or content)');
  }

  const model = completion.model ?? 'unknown';
  const usage = completion.usage;
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const cacheReadTokens = usage?.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = usage?.cache_creation_input_tokens ?? 0;

  // 7. Calculate cost (strip provider prefix for pricing lookup)
  const modelForPricing = stripProviderPrefix(model);
  const costEur = calculateCost(
    {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens: cacheWriteTokens,
    },
    modelForPricing,
  );

  // Derive provider from model string
  const provider = deriveProvider(model);

  // 8. Write to DB in a transaction
  const draft = await prisma.$transaction(async (tx) => {
    const created = await tx.aiDraft.create({
      data: {
        conversationId,
        messageId,
        content: draftContent,
        status: 'pending',
        model,
        tokensUsed: inputTokens + outputTokens,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        costEur,
        provider,
        durationMs,
        flags,
      },
    });

    await writeAuditLog(tx, {
      entityType: 'ai_draft',
      entityId: created.id,
      action: 'create',
      changes: { model, inputTokens, outputTokens, costEur, flags },
      actor: 'system',
    });

    return created;
  });

  // 9. Log edge-case warnings
  if (flags.length > 0) {
    logger.warn({ conversationId, flags }, 'Sensitive message detected -- review draft carefully');
  }

  // 10. Log generation info
  logger.info(
    {
      draftId: draft.id,
      model,
      provider,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      costEur,
      durationMs,
      flags,
    },
    'AI draft generated',
  );

  return {
    draftId: draft.id,
    content: draftContent,
    model,
    provider,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costEur,
    durationMs,
    flags,
  };
}

// ─── Helpers ────────────────────────────────────────────

/**
 * Strip provider prefix from model string.
 * OpenClaw returns "anthropic/claude-sonnet-4-5-20250929" but cost calculator
 * expects "claude-sonnet-4-5-20250929".
 */
function stripProviderPrefix(model: string): string {
  const slashIndex = model.indexOf('/');
  return slashIndex >= 0 ? model.slice(slashIndex + 1) : model;
}

/**
 * Derive the AI provider name from the model string.
 * OpenClaw returns model names prefixed with provider (e.g., "anthropic/claude-sonnet-4-5-20250929").
 */
function deriveProvider(model: string): string {
  if (model.includes('claude') || model.startsWith('anthropic/')) {
    return 'anthropic';
  }
  if (model.includes('gpt') || model.startsWith('openai/')) {
    return 'openai';
  }
  return 'unknown';
}
