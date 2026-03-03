import crypto from 'crypto';
import { z } from 'zod';
import type { FastifyBaseLogger } from 'fastify';
import type { GatewayWsClient } from '../gateway/gateway-ws-client.js';
import type { ChatEvent } from '../gateway/types.js';
import type { ParsedEmail } from './email-parser.js';
import type { ClassificationResult } from './email-classifier.js';
import { classifyEmailByRules } from './email-classifier.js';
import { INBOX_CLASSIFICATIONS, type InboxClassification } from './inbox-classification.js';

const CLASSIFICATION_TIMEOUT_MS = 45_000;
const MAX_EMAIL_TEXT_LENGTH = 4_000;
const MAX_THREAD_MESSAGES = 4;

export interface GuestSuggestion {
  name: string | null;
  email: string | null;
  phone: string | null;
  shouldCreate: boolean;
}

export interface OpenClawClassificationResult extends ClassificationResult {
  suggestion: GuestSuggestion;
}

const classificationResponseSchema = z.object({
  category: z.enum(INBOX_CLASSIFICATIONS),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().min(1).max(500).optional(),
  suggestion: z.object({
    name: z.string().trim().min(1).max(200).nullable().optional(),
    email: z.string().trim().email().nullable().optional(),
    phone: z.string().trim().min(3).max(60).nullable().optional(),
    shouldCreate: z.boolean().optional(),
  }).optional(),
});

const CLASSIFIER_SYSTEM_PROMPT = [
  'You are a strict inbound-email classifier for Puppy Yoga Retreat.',
  'Return JSON only. No markdown, no prose.',
  'Allowed categories:',
  '- conversation: direct customer inquiry/reply/chat-like email',
  '- ota_tripaneer: OTA/system emails from Tripaneer platform',
  '- ota_bookyogaretreats: OTA/system emails from BookYogaRetreats',
  '- ota_other: OTA/system emails from any other OTA source',
  '- other: all newsletters, spam, admin/system/noise emails',
  '- guest_inquiry, ota_notification, spam_newsletter, admin_system are legacy allowed outputs; use only if the input clearly belongs there',
  'Also return suggestion object with potential customer data and whether to suggest manual guest creation.',
  'Never call tools. Never include explanations outside the JSON response.',
].join('\n');

function sanitizeSuggestion(input?: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  shouldCreate?: boolean;
}): GuestSuggestion {
  return {
    name: input?.name ?? null,
    email: input?.email ?? null,
    phone: input?.phone ?? null,
    shouldCreate: input?.shouldCreate ?? false,
  };
}

function extractJsonBlock(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

function extractEventText(message: unknown): { text: string; snapshot: boolean } {
  if (!message || typeof message !== 'object') return { text: '', snapshot: false };
  const msg = message as Record<string, unknown>;
  const content = msg.content;
  const snapshot = msg.snapshot === true;

  if (typeof content === 'string') {
    return { text: content, snapshot };
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const block = part as Record<string, unknown>;
        return typeof block.text === 'string' ? block.text : '';
      })
      .join('');
    return { text, snapshot };
  }

  return { text: '', snapshot };
}

function normalizeLegacyCategory(category: InboxClassification): InboxClassification {
  // Keep legacy values if model returns them, but prefer canonical classes.
  switch (category) {
    case 'guest_inquiry':
      return 'conversation';
    case 'ota_notification':
      return 'ota_other';
    case 'spam_newsletter':
    case 'admin_system':
      return 'other';
    default:
      return category;
  }
}

function buildClassificationInput(
  parsed: ParsedEmail,
  recentMessages: Array<{ direction: 'in' | 'out'; content: string }>,
): string {
  const text = parsed.text.slice(0, MAX_EMAIL_TEXT_LENGTH);
  const thread = recentMessages.slice(-MAX_THREAD_MESSAGES).map((msg) => ({
    direction: msg.direction,
    content: msg.content.slice(0, 500),
  }));

  return JSON.stringify({
    from: {
      name: parsed.from.name || null,
      address: parsed.from.address || null,
    },
    subject: parsed.subject || null,
    text,
    inReplyTo: parsed.inReplyTo || null,
    references: parsed.references,
    thread,
  });
}

async function collectAgentText(
  gateway: GatewayWsClient,
  logger: FastifyBaseLogger,
  sessionKey: string,
  message: string,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let content = '';
    const agentScopedSessionKey = `agent:main:${sessionKey}`;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsub();
      reject(new Error(`OpenClaw classification timed out after ${CLASSIFICATION_TIMEOUT_MS}ms`));
    }, CLASSIFICATION_TIMEOUT_MS);

    const unsub = gateway.onChatEvent((event: ChatEvent) => {
      if (event.sessionKey !== agentScopedSessionKey && event.sessionKey !== sessionKey) {
        return;
      }

      if (event.state === 'delta' && event.message) {
        const { text, snapshot } = extractEventText(event.message);
        if (text) {
          content = snapshot ? text : (content + text);
        }
        return;
      }

      if (event.state === 'final') {
        if (event.message) {
          const { text, snapshot } = extractEventText(event.message);
          if (text) {
            content = snapshot ? text : (content + text);
          }
        }
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        unsub();
        resolve(content.trim());
        return;
      }

      if (event.state === 'error') {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        unsub();
        reject(new Error(event.errorMessage ?? 'OpenClaw returned classification error'));
        return;
      }

      if (event.state === 'aborted') {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        unsub();
        reject(new Error('OpenClaw classification aborted'));
      }
    });

    gateway.request('agent', {
      message,
      agentId: 'main',
      sessionKey,
      deliver: false,
      idempotencyKey: crypto.randomUUID(),
      extraSystemPrompt: CLASSIFIER_SYSTEM_PROMPT,
    }).catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsub();
      logger.warn({ err }, 'OpenClaw request failed during inbound classification');
      reject(err);
    });
  });
}

export async function classifyEmailWithOpenClaw(params: {
  gateway: GatewayWsClient;
  parsed: ParsedEmail;
  conversationId?: string;
  recentMessages?: Array<{ direction: 'in' | 'out'; content: string }>;
  logger: FastifyBaseLogger;
}): Promise<OpenClawClassificationResult> {
  const { gateway, parsed, conversationId, recentMessages = [], logger } = params;

  const fallback = classifyEmailByRules(parsed.from, parsed.subject);
  const fallbackWithSuggestion: OpenClawClassificationResult = {
    ...fallback,
    suggestion: {
      name: parsed.from.name || null,
      email: parsed.from.address || null,
      phone: null,
      shouldCreate: fallback.category === 'conversation',
    },
  };

  if (!gateway.isConnected) {
    logger.warn('Gateway unavailable for classification, using rules fallback');
    return fallbackWithSuggestion;
  }

  const sessionKey = `email-classify:${conversationId ?? 'new'}:${Date.now()}`;
  const input = buildClassificationInput(parsed, recentMessages);

  try {
    const raw = await collectAgentText(gateway, logger, sessionKey, input);
    const json = extractJsonBlock(raw);

    if (!json) {
      logger.warn({ raw }, 'Classifier returned non-JSON output, using rules fallback');
      return fallbackWithSuggestion;
    }

    const parsedResult = classificationResponseSchema.safeParse(JSON.parse(json));
    if (!parsedResult.success) {
      logger.warn(
        { issues: parsedResult.error.issues, raw },
        'Classifier JSON failed schema validation, using rules fallback',
      );
      return fallbackWithSuggestion;
    }

    const category = normalizeLegacyCategory(parsedResult.data.category);
    const confidence = parsedResult.data.confidence ?? 0.65;
    const reason = parsedResult.data.reason ?? 'OpenClaw classification';

    return {
      category,
      confidence,
      reason,
      source: 'openclaw',
      suggestion: sanitizeSuggestion(parsedResult.data.suggestion),
    };
  } catch (err) {
    logger.warn({ err }, 'OpenClaw classifier failed, using rules fallback');
    return fallbackWithSuggestion;
  }
}
