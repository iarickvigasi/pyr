import { z } from 'zod';
import type { FastifyBaseLogger } from 'fastify';
import type { GatewayWsClient } from '../gateway/gateway-ws-client.js';
import { collectAgentText, extractJsonBlock } from '../gateway/agent-stream.js';
import type { ParsedEmail } from './email-parser.js';
import type { ClassificationResult } from './email-classifier.js';
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

export async function classifyEmailWithOpenClaw(params: {
  gateway: GatewayWsClient;
  parsed: ParsedEmail;
  conversationId?: string;
  recentMessages?: Array<{ direction: 'in' | 'out'; content: string }>;
  logger: FastifyBaseLogger;
}): Promise<OpenClawClassificationResult> {
  const { gateway, parsed, conversationId, recentMessages = [], logger } = params;
  const openClawErrorResult = (reason: string): OpenClawClassificationResult => ({
    category: 'other',
    confidence: 0,
    reason,
    source: 'openclaw_error',
    suggestion: {
      name: parsed.from.name || null,
      email: parsed.from.address || null,
      phone: null,
      shouldCreate: false,
    },
  });

  if (!gateway.isConnected) {
    logger.warn('Gateway unavailable for classification, returning safe category');
    return openClawErrorResult('OpenClaw gateway unavailable for classification');
  }

  const sessionKey = `email-classify:${conversationId ?? 'new'}:${Date.now()}`;
  const input = buildClassificationInput(parsed, recentMessages);

  try {
    const raw = await collectAgentText({
      gateway,
      sessionKey,
      message: input,
      extraSystemPrompt: CLASSIFIER_SYSTEM_PROMPT,
      timeoutMs: CLASSIFICATION_TIMEOUT_MS,
      timeoutMessage: `OpenClaw classification timed out after ${CLASSIFICATION_TIMEOUT_MS}ms`,
      logger,
      requestErrorLogMessage: 'OpenClaw request failed during inbound classification',
    });
    const json = extractJsonBlock(raw);

    if (!json) {
      logger.warn({ raw }, 'Classifier returned non-JSON output');
      return openClawErrorResult('OpenClaw returned invalid classification response format');
    }

    const parsedResult = classificationResponseSchema.safeParse(JSON.parse(json));
    if (!parsedResult.success) {
      logger.warn(
        { issues: parsedResult.error.issues, raw },
        'Classifier JSON failed schema validation',
      );
      return openClawErrorResult('OpenClaw returned malformed classification JSON');
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
    logger.warn({ err }, 'OpenClaw classifier failed');
    const reason = err instanceof Error ? err.message : 'OpenClaw classification failed';
    return openClawErrorResult(reason);
  }
}
