import { z } from 'zod';
import type { FastifyBaseLogger } from 'fastify';
import type { GatewayWsClient } from '../gateway/gateway-ws-client.js';
import { collectAgentText, extractJsonBlock } from '../gateway/agent-stream.js';

const BOOKING_ANALYSIS_TIMEOUT_MS = 45_000;
const MAX_LATEST_MESSAGE_LENGTH = 4_000;
const MAX_THREAD_MESSAGES = 6;

export type BookingMissingField = 'checkIn' | 'checkOut';

export interface BookingAnalysisCandidate {
  checkIn: string | null; // YYYY-MM-DD
  checkOut: string | null; // YYYY-MM-DD
  totalPrice: number | null; // cents
  currency: 'EUR' | null;
  source: string | null;
  notes: string | null;
  guest: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  confidence: number | null;
}

export interface OpenClawBookingAnalysisResult {
  status: 'ready' | 'insufficient_data' | 'not_applicable' | 'error';
  reason: string;
  missingFields: BookingMissingField[];
  candidate: BookingAnalysisCandidate | null;
}

interface AnalyzeBookingParams {
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
}

const extractionSchema = z.object({
  bookingIntent: z.boolean(),
  reason: z.string().trim().min(1).max(500).optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  candidate: z.object({
    checkIn: z.string().trim().nullable().optional(),
    checkOut: z.string().trim().nullable().optional(),
    totalPrice: z.union([z.number(), z.string()]).nullable().optional(),
    currency: z.string().trim().nullable().optional(),
    source: z.string().trim().nullable().optional(),
    notes: z.string().trim().nullable().optional(),
    guest: z.object({
      name: z.string().trim().nullable().optional(),
      email: z.string().trim().nullable().optional(),
      phone: z.string().trim().nullable().optional(),
    }).nullable().optional(),
  }).nullable().optional(),
});

const BOOKING_ANALYZER_SYSTEM_PROMPT = [
  'You extract booking details from customer and OTA email conversations for Puppy Yoga Retreat.',
  'Return JSON only. No markdown, no prose, no extra keys.',
  'Schema:',
  '{',
  '  "bookingIntent": boolean,',
  '  "reason": string,',
  '  "confidence": number|null,',
  '  "candidate": {',
  '    "checkIn": string|null,',
  '    "checkOut": string|null,',
  '    "totalPrice": number|string|null,',
  '    "currency": "EUR"|null,',
  '    "source": string|null,',
  '    "notes": string|null,',
  '    "guest": { "name": string|null, "email": string|null, "phone": string|null }',
  '  }|null',
  '}',
  'Rules:',
  '- If this is not a booking/reservation intent, set bookingIntent=false and candidate=null.',
  '- checkIn/checkOut MUST be YYYY-MM-DD when known; otherwise null.',
  '- totalPrice is integer cents when known; otherwise null.',
  '- currency must be EUR or null.',
  '- Never call tools.',
].join('\n');

function normalizeCurrency(input: string | null | undefined): 'EUR' | null {
  if (!input) return null;
  const normalized = input.trim().toUpperCase();
  if (normalized === 'EUR' || normalized === '€') return 'EUR';
  return null;
}

function normalizeDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day
    ) {
      return raw;
    }
    return null;
  }

  const dmyMatch = raw.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day
    ) {
      return date.toISOString().slice(0, 10);
    }
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeTotalPrice(input: number | string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return Math.round(input);
  }

  const numeric = Number(input.replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric);
}

function buildInput(params: AnalyzeBookingParams): string {
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
      content: m.content.slice(0, 600),
    })),
  });
}

function buildCandidate(
  candidate: z.infer<typeof extractionSchema>['candidate'],
  confidence: number | null,
): BookingAnalysisCandidate | null {
  if (!candidate) return null;
  return {
    checkIn: normalizeDate(candidate.checkIn),
    checkOut: normalizeDate(candidate.checkOut),
    totalPrice: normalizeTotalPrice(candidate.totalPrice),
    currency: normalizeCurrency(candidate.currency),
    source: candidate.source?.trim() || null,
    notes: candidate.notes?.trim() || null,
    guest: {
      name: candidate.guest?.name?.trim() || null,
      email: candidate.guest?.email?.trim() || null,
      phone: candidate.guest?.phone?.trim() || null,
    },
    confidence,
  };
}

export async function analyzeBookingWithOpenClaw(
  params: AnalyzeBookingParams,
): Promise<OpenClawBookingAnalysisResult> {
  const { gateway, logger, conversationId } = params;

  if (!gateway.isConnected) {
    logger.warn({ conversationId }, 'Booking analysis skipped: gateway not connected');
    return {
      status: 'error',
      reason: 'OpenClaw gateway is not connected',
      missingFields: [],
      candidate: null,
    };
  }

  const sessionKey = `booking-analyze:${conversationId}:${Date.now()}`;
  const input = buildInput(params);

  logger.info({ conversationId }, 'Starting OpenClaw booking analysis');

  try {
    const raw = await collectAgentText({
      gateway,
      sessionKey,
      message: input,
      extraSystemPrompt: BOOKING_ANALYZER_SYSTEM_PROMPT,
      timeoutMs: BOOKING_ANALYSIS_TIMEOUT_MS,
      timeoutMessage: `Booking analysis timed out after ${BOOKING_ANALYSIS_TIMEOUT_MS}ms`,
    });
    const json = extractJsonBlock(raw);
    if (!json) {
      logger.warn({ conversationId, raw }, 'Booking analysis returned non-JSON output');
      return {
        status: 'error',
        reason: 'OpenClaw returned an invalid response format',
        missingFields: [],
        candidate: null,
      };
    }

    const parsedJson = JSON.parse(json);
    const parsed = extractionSchema.safeParse(parsedJson);
    if (!parsed.success) {
      logger.warn({ conversationId, issues: parsed.error.issues }, 'Booking analysis JSON failed schema validation');
      return {
        status: 'error',
        reason: 'OpenClaw returned malformed booking analysis JSON',
        missingFields: [],
        candidate: null,
      };
    }

    const confidence = parsed.data.confidence ?? null;
    const reason = parsed.data.reason ?? 'Booking analysis completed';
    const candidate = buildCandidate(parsed.data.candidate, confidence);

    if (!parsed.data.bookingIntent) {
      logger.info({ conversationId, status: 'not_applicable' }, 'Completed OpenClaw booking analysis');
      return {
        status: 'not_applicable',
        reason,
        missingFields: [],
        candidate: null,
      };
    }

    const missingFields: BookingMissingField[] = [];
    if (!candidate?.checkIn) missingFields.push('checkIn');
    if (!candidate?.checkOut) missingFields.push('checkOut');

    if (missingFields.length > 0) {
      logger.info(
        { conversationId, status: 'insufficient_data', missingFields },
        'Completed OpenClaw booking analysis',
      );
      return {
        status: 'insufficient_data',
        reason,
        missingFields,
        candidate,
      };
    }

    logger.info({ conversationId, status: 'ready' }, 'Completed OpenClaw booking analysis');
    return {
      status: 'ready',
      reason,
      missingFields: [],
      candidate,
    };
  } catch (err) {
    logger.warn({ err, conversationId }, 'OpenClaw booking analysis failed');
    return {
      status: 'error',
      reason: err instanceof Error ? err.message : 'OpenClaw booking analysis failed',
      missingFields: [],
      candidate: null,
    };
  }
}
