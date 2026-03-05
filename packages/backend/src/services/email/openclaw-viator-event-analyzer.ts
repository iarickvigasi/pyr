import crypto from 'crypto';
import { z } from 'zod';
import type { FastifyBaseLogger } from 'fastify';
import type { EventType } from '@prisma/client';
import type { GatewayWsClient } from '../gateway/gateway-ws-client.js';
import type { ChatEvent } from '../gateway/types.js';

const VIATOR_ANALYSIS_TIMEOUT_MS = 45_000;
const MAX_LATEST_MESSAGE_LENGTH = 5_000;
const MAX_THREAD_MESSAGES = 8;

export type ViatorEventIntent = 'create_or_link' | 'cancel' | 'move' | null;
export type ViatorEventMissingField =
  | 'externalBookingId'
  | 'eventDate'
  | 'eventTime';

export interface ViatorEventCandidate {
  externalBookingId: string | null;
  externalProductCode: string | null;
  eventType: EventType | null;
  eventTitle: string | null;
  eventDate: string | null; // YYYY-MM-DD
  eventTime: string | null; // HH:MM
  location: string | null;
  attendeeCount: number | null;
  guest: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  confidence: number | null;
}

export interface ViatorGuestFieldDiff {
  current: string | null;
  proposed: string | null;
}

export interface ViatorEventResolution {
  matchedGuestId: string | null;
  matchedEventId: string | null;
  matchedEventBookingId: string | null;
  recommendedOperation: 'create_or_link' | 'cancel' | 'move' | 'none';
  guestFieldDiffs: {
    name: ViatorGuestFieldDiff;
    email: ViatorGuestFieldDiff;
    phone: ViatorGuestFieldDiff;
  };
}

export interface OpenClawViatorEventAnalysisResult {
  status: 'ready' | 'insufficient_data' | 'not_applicable' | 'error';
  reason: string;
  intent: ViatorEventIntent;
  missingFields: ViatorEventMissingField[];
  candidate: ViatorEventCandidate | null;
  resolution: ViatorEventResolution | null;
}

interface AnalyzeViatorEventParams {
  gateway: GatewayWsClient;
  logger: FastifyBaseLogger;
  conversationId: string;
  classification: string | null;
  subject: string | null;
  latestInboundMessage: {
    fromName: string | null;
    fromAddress: string | null;
    subject: string | null;
    content: string;
  };
  recentMessages: Array<{ direction: 'in' | 'out'; content: string }>;
  linkedContext: {
    guest: {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
    } | null;
    existingRegistration: {
      id: string;
      externalBookingId: string | null;
      eventId: string;
      status: 'confirmed' | 'waitlisted' | 'cancelled';
    } | null;
  };
}

const responseSchema = z.object({
  intent: z.enum(['create_or_link', 'cancel', 'move', 'none']).optional(),
  reason: z.string().trim().min(1).max(600).optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  candidate: z.object({
    externalBookingId: z.string().trim().nullable().optional(),
    externalProductCode: z.string().trim().nullable().optional(),
    eventType: z.enum(['puppy_yoga', 'beach_walk', 'coffee_cake_cuddles', 'retreat']).nullable().optional(),
    eventTitle: z.string().trim().nullable().optional(),
    eventDate: z.string().trim().nullable().optional(),
    eventTime: z.string().trim().nullable().optional(),
    location: z.string().trim().nullable().optional(),
    attendeeCount: z.union([z.number(), z.string()]).nullable().optional(),
    guest: z.object({
      name: z.string().trim().nullable().optional(),
      email: z.string().trim().nullable().optional(),
      phone: z.string().trim().nullable().optional(),
    }).nullable().optional(),
  }).nullable().optional(),
});

const SYSTEM_PROMPT = [
  'You extract Viator booking-event details from an inbox thread for Puppy Yoga Retreat.',
  'Return strict JSON only with no markdown and no extra keys.',
  'Schema:',
  '{',
  '  "intent": "create_or_link"|"cancel"|"move"|"none",',
  '  "reason": string,',
  '  "confidence": number|null,',
  '  "candidate": {',
  '    "externalBookingId": string|null,',
  '    "externalProductCode": string|null,',
  '    "eventType": "puppy_yoga"|"beach_walk"|"coffee_cake_cuddles"|"retreat"|null,',
  '    "eventTitle": string|null,',
  '    "eventDate": "YYYY-MM-DD"|null,',
  '    "eventTime": "HH:MM"|null,',
  '    "location": string|null,',
  '    "attendeeCount": number|null,',
  '    "guest": { "name": string|null, "email": string|null, "phone": string|null }',
  '  }|null',
  '}',
  'Rules:',
  '- intent="none" when message is not actionable for event registration.',
  '- cancellation emails should set intent="cancel".',
  '- reschedule/change should set intent="move".',
  '- eventDate and eventTime must be null if unknown.',
  '- attendeeCount should be integer >= 1 when known.',
  '- Never call tools.',
].join('\n');

function normalizeDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (
      date.getUTCFullYear() === y
      && date.getUTCMonth() === m - 1
      && date.getUTCDate() === d
    ) {
      return raw;
    }
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeTime(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  const match = raw.match(/([01]\d|2[0-3]):([0-5]\d)/);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function normalizeAttendeeCount(input: number | string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    const value = Math.round(input);
    return value >= 1 ? value : null;
  }
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  if (!Number.isFinite(value) || value < 1) return null;
  return Math.round(value);
}

function extractJsonBlock(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

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

  return { text: '', snapshot: false };
}

function buildInput(params: AnalyzeViatorEventParams): string {
  return JSON.stringify({
    conversationId: params.conversationId,
    classification: params.classification,
    subject: params.subject,
    latestInbound: {
      fromName: params.latestInboundMessage.fromName,
      fromAddress: params.latestInboundMessage.fromAddress,
      subject: params.latestInboundMessage.subject,
      content: params.latestInboundMessage.content.slice(0, MAX_LATEST_MESSAGE_LENGTH),
    },
    recentThread: params.recentMessages.slice(-MAX_THREAD_MESSAGES).map((m) => ({
      direction: m.direction,
      content: m.content.slice(0, 800),
    })),
    linkedContext: params.linkedContext,
  });
}

async function collectAgentText(
  gateway: GatewayWsClient,
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
      reject(new Error(`Viator event analysis timed out after ${VIATOR_ANALYSIS_TIMEOUT_MS}ms`));
    }, VIATOR_ANALYSIS_TIMEOUT_MS);

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
        reject(new Error(event.errorMessage ?? 'OpenClaw Viator event analysis error'));
        return;
      }

      if (event.state === 'aborted') {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        unsub();
        reject(new Error('OpenClaw Viator event analysis aborted'));
      }
    });

    gateway.request('agent', {
      message,
      agentId: 'main',
      sessionKey,
      deliver: false,
      idempotencyKey: crypto.randomUUID(),
      extraSystemPrompt: SYSTEM_PROMPT,
    }).catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsub();
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

function normalizeIntent(intent: z.infer<typeof responseSchema>['intent']): ViatorEventIntent {
  if (intent === 'create_or_link' || intent === 'cancel' || intent === 'move') {
    return intent;
  }
  return null;
}

function buildCandidate(
  candidate: z.infer<typeof responseSchema>['candidate'],
  confidence: number | null,
): ViatorEventCandidate | null {
  if (!candidate) return null;
  return {
    externalBookingId: candidate.externalBookingId?.trim() || null,
    externalProductCode: candidate.externalProductCode?.trim() || null,
    eventType: candidate.eventType ?? null,
    eventTitle: candidate.eventTitle?.trim() || null,
    eventDate: normalizeDate(candidate.eventDate),
    eventTime: normalizeTime(candidate.eventTime),
    location: candidate.location?.trim() || null,
    attendeeCount: normalizeAttendeeCount(candidate.attendeeCount),
    guest: {
      name: candidate.guest?.name?.trim() || null,
      email: candidate.guest?.email?.trim() || null,
      phone: candidate.guest?.phone?.trim() || null,
    },
    confidence,
  };
}

function buildResolution(
  params: AnalyzeViatorEventParams,
  intent: ViatorEventIntent,
  candidate: ViatorEventCandidate | null,
): ViatorEventResolution | null {
  const linkedGuest = params.linkedContext.guest;
  const guestDiffs = {
    name: {
      current: linkedGuest?.name ?? null,
      proposed: candidate?.guest.name ?? null,
    },
    email: {
      current: linkedGuest?.email ?? null,
      proposed: candidate?.guest.email ?? null,
    },
    phone: {
      current: linkedGuest?.phone ?? null,
      proposed: candidate?.guest.phone ?? null,
    },
  };

  const recommendedOperation = intent ?? 'none';

  return {
    matchedGuestId: linkedGuest?.id ?? null,
    matchedEventId: params.linkedContext.existingRegistration?.eventId ?? null,
    matchedEventBookingId: params.linkedContext.existingRegistration?.id ?? null,
    recommendedOperation,
    guestFieldDiffs: guestDiffs,
  };
}

export async function analyzeViatorEventWithOpenClaw(
  params: AnalyzeViatorEventParams,
): Promise<OpenClawViatorEventAnalysisResult> {
  const { gateway, logger, conversationId } = params;

  if (!gateway.isConnected) {
    logger.warn({ conversationId }, 'Viator event analysis skipped: gateway not connected');
    return {
      status: 'error',
      reason: 'OpenClaw gateway is not connected',
      intent: null,
      missingFields: [],
      candidate: null,
      resolution: null,
    };
  }

  const sessionKey = `viator-event-analyze:${conversationId}:${Date.now()}`;
  const input = buildInput(params);

  logger.info({ conversationId }, 'viator_analysis_started');

  try {
    const raw = await collectAgentText(gateway, sessionKey, input);
    const json = extractJsonBlock(raw);
    if (!json) {
      return {
        status: 'error',
        reason: 'OpenClaw returned invalid response format',
        intent: null,
        missingFields: [],
        candidate: null,
        resolution: null,
      };
    }

    const parsedJson = JSON.parse(json);
    const parsed = responseSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return {
        status: 'error',
        reason: 'OpenClaw returned malformed Viator analysis JSON',
        intent: null,
        missingFields: [],
        candidate: null,
        resolution: null,
      };
    }

    const confidence = parsed.data.confidence ?? null;
    const reason = parsed.data.reason ?? 'Viator event analysis completed';
    const intent = normalizeIntent(parsed.data.intent);
    const candidate = buildCandidate(parsed.data.candidate, confidence);
    const resolution = buildResolution(params, intent, candidate);

    if (!intent) {
      return {
        status: 'not_applicable',
        reason,
        intent,
        missingFields: [],
        candidate,
        resolution,
      };
    }

    const missingFields: ViatorEventMissingField[] = [];
    if (!candidate?.externalBookingId) missingFields.push('externalBookingId');
    if (intent !== 'cancel') {
      if (!candidate?.eventDate) missingFields.push('eventDate');
      if (!candidate?.eventTime) missingFields.push('eventTime');
    }

    const status = missingFields.length > 0 ? 'insufficient_data' : 'ready';

    logger.info({ conversationId, status, intent }, 'viator_analysis_completed');

    return {
      status,
      reason,
      intent,
      missingFields,
      candidate,
      resolution,
    };
  } catch (err) {
    logger.warn({ err, conversationId }, 'viator_analysis_failed');
    return {
      status: 'error',
      reason: err instanceof Error ? err.message : 'OpenClaw Viator event analysis failed',
      intent: null,
      missingFields: [],
      candidate: null,
      resolution: null,
    };
  }
}
