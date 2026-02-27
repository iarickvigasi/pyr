/**
 * AI draft generator -- orchestrates context building, WebSocket agent call,
 * edge-case classification, cost calculation, and DB write.
 *
 * The draft generator uses the persistent WebSocket connection to the OpenClaw
 * Gateway via gateway.request('agent', ...) with extraSystemPrompt for business
 * context injection. Chat events are accumulated until the final state to
 * extract content, usage, and model.
 *
 * No direct LLM SDK imports -- all AI calls go through the OpenClaw Gateway.
 */

import crypto from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { buildDraftContext } from './context-builder.js';
import { buildSystemPrompt } from './prompts/system.js';
import { classifyEdgeCases } from './classifier.js';
import { calculateCost } from './cost-calculator.js';
import { writeAuditLog } from '../../lib/audit.js';
import type { GatewayWsClient } from '../gateway/gateway-ws-client.js';
import type { ChatEvent } from '../gateway/types.js';

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
  gateway: GatewayWsClient;
  conversationId: string;
  messageId: string;
  guestLanguage: 'en' | 'de';
  logger: FastifyBaseLogger;
}

// ─── Constants ──────────────────────────────────────────

/** Maximum number of conversation messages to include in the prompt */
const MAX_MESSAGES = 20;

/**
 * Timeout for the chat event accumulation promise (90 seconds).
 * Separate from the Gateway's 120s RPC request timeout which covers the initial
 * gateway.request() acknowledgment. This timeout covers the subsequent chat event
 * stream which has no built-in timeout -- if the Gateway acknowledges the request
 * but fails to emit final/error events, the promise would hang indefinitely.
 */
const CHAT_EVENT_TIMEOUT_MS = 90_000;

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
  const { prisma, gateway, conversationId, messageId, guestLanguage, logger } = params;

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

  // 6. Call OpenClaw Gateway via WebSocket agent method
  const startTime = Date.now();

  // Pre-check: fail fast with clear error if Gateway is not connected
  if (!gateway.isConnected) {
    throw new Error('Gateway WebSocket not connected -- cannot generate draft');
  }

  // Use a unique session key per draft to isolate concurrent jobs
  const draftSessionKey = `draft:${conversationId}:${Date.now()}`;

  // Accumulate response via chat events (with timeout to prevent indefinite hangs)
  const result = await new Promise<{ content: string; usage: ChatEvent['usage']; model: string }>((resolve, reject) => {
    let content = '';
    let usage: ChatEvent['usage'] = undefined;
    let model = 'unknown';
    let settled = false;

    // Timeout: reject if no final/error event arrives within CHAT_EVENT_TIMEOUT_MS
    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsub();
      reject(new Error(`Draft generation timed out waiting for chat events (${CHAT_EVENT_TIMEOUT_MS / 1000}s)`));
    }, CHAT_EVENT_TIMEOUT_MS);

    const unsub = gateway.onChatEvent((evt) => {
      if (evt.sessionKey !== draftSessionKey) return;

      if (evt.state === 'delta' && evt.message) {
        // Extract delta content from message
        const msg = evt.message as { content?: string };
        if (msg.content) content += msg.content;
      }
      if (evt.state === 'final') {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        usage = evt.usage;
        model = evt.model ?? 'unknown';
        unsub();
        resolve({ content, usage, model });
      }
      if (evt.state === 'error') {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        unsub();
        reject(new Error(evt.errorMessage ?? 'Agent error during draft generation'));
      }
      if (evt.state === 'aborted') {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        unsub();
        reject(new Error('Draft generation aborted'));
      }
    });

    // The last user message is the latest inbound email
    const lastUserMessage = chatMessages[chatMessages.length - 1]?.content ?? messageContent;

    gateway.request('agent', {
      message: lastUserMessage,
      agentId: 'main',
      sessionKey: draftSessionKey,
      deliver: false, // Draft generation does NOT deliver to WhatsApp
      idempotencyKey: crypto.randomUUID(),
      extraSystemPrompt: systemPrompt, // Full business context injected here
    }).catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      unsub();
      reject(err);
    });
  });
  const durationMs = Date.now() - startTime;

  const draftContent = result.content;
  if (!draftContent) {
    throw new Error('Gateway returned empty response (no content from agent)');
  }

  const model = result.model;
  const usage = result.usage;
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
