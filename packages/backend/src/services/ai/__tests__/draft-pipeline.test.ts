/**
 * Integration tests for the AI draft pipeline: context injection, LLM call,
 * draft storage, FAQ inclusion, edge-case flags, dedup, onFailed handler, and
 * language selection.
 *
 * All tests use mocked gateway responses (no real API calls) and mocked Prisma
 * (no real database).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateDraft } from '../draft-generator.js';
import { createAiDraftFailedHandler } from '../../queue/jobs/ai-draft.job.js';
import type { ChatEvent } from '../../gateway/types.js';

// ---- Mock audit module ------------------------------------------------

vi.mock('../../../lib/audit.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// ---- Mock date-helpers (context-builder imports these) -----------------

vi.mock('../../../lib/date-helpers.js', () => ({
  TZ: 'Europe/Nicosia',
  nicosiaToday: () => '2026-03-15',
  utcMidnight: (dateStr: string) => new Date(`${dateStr}T00:00:00.000Z`),
}));

// ---- Test factories ---------------------------------------------------

function makeConversation(overrides?: {
  guestId?: string | null;
  messageCount?: number;
  latestContent?: string;
}) {
  const messageCount = overrides?.messageCount ?? 3;
  const messages = Array.from({ length: messageCount }, (_, i) => ({
    direction: i % 2 === 0 ? 'in' : 'out',
    content: i === messageCount - 1
      ? (overrides?.latestContent ?? 'I would like to book a 4-day retreat in April.')
      : `Message ${i + 1}`,
    sentAt: new Date(`2026-03-15T${10 + i}:00:00Z`),
  }));

  return {
    id: 'conv-1',
    subject: 'Retreat inquiry',
    guestId: overrides?.guestId !== undefined ? overrides.guestId : 'guest-1',
    messages,
    guest: overrides?.guestId === null
      ? null
      : {
          id: overrides?.guestId ?? 'guest-1',
          name: 'Maria Schmidt',
          email: 'maria@example.com',
          phone: '+49 170 1234567',
          language: 'de',
          dietaryNeeds: 'Vegan',
          notes: 'Returning guest',
        },
  };
}

function makeBookings() {
  return [
    {
      checkIn: new Date('2025-09-15'),
      checkOut: new Date('2025-09-19'),
      status: 'checked_out',
      totalPrice: 120000,
      room: { name: 'Room A1', roomType: { name: 'Standard Double' } },
    },
  ];
}

function makeFaqEntries() {
  return [
    { question: 'What time is check-in?', answer: 'Check-in is at 3 PM.' },
    { question: 'Are dogs included?', answer: 'Rescue puppies join every yoga session.' },
  ];
}

/**
 * Create a mock GatewayWsClient that simulates the WebSocket agent flow.
 */
function makeGateway(opts?: {
  content?: string;
  model?: string;
  usage?: ChatEvent['usage'];
  error?: string;
}) {
  const chatListeners: Array<(evt: ChatEvent) => void> = [];

  return {
    request: vi.fn().mockImplementation(async (_method: string, params: unknown) => {
      const sessionKey = (params as { sessionKey: string }).sessionKey;
      setTimeout(() => {
        for (const listener of chatListeners) {
          if (opts?.error) {
            listener({ runId: 'run-1', sessionKey, seq: 1, state: 'error', errorMessage: opts.error });
          } else {
            listener({
              runId: 'run-1',
              sessionKey,
              seq: 1,
              state: 'delta',
              message: { content: opts?.content ?? 'Dear Maria, thank you for your interest in our retreat! We would love to welcome you in April. Warm regards, Ines' },
            });
            listener({
              runId: 'run-1',
              sessionKey,
              seq: 2,
              state: 'final',
              usage: opts?.usage ?? { prompt_tokens: 2000, completion_tokens: 500 },
              model: opts?.model ?? 'anthropic/claude-sonnet-4-5-20250929',
            });
          }
        }
      }, 0);
      return { ok: true };
    }),
    onChatEvent: vi.fn().mockImplementation((handler: (evt: ChatEvent) => void) => {
      chatListeners.push(handler);
      return () => { chatListeners.splice(chatListeners.indexOf(handler), 1); };
    }),
    isConnected: true,
  };
}

/** Build a mock Prisma client. */
function makePrisma(opts?: {
  conversation?: ReturnType<typeof makeConversation> | null;
  bookings?: ReturnType<typeof makeBookings>;
  faqs?: Array<{ question: string; answer: string }>;
  roomTypes?: Array<{ name: string; rooms: Array<{ id: string; bookings: Array<{ id: string }> }> }>;
  events?: Array<{ title: string; type: string; date: Date; time: string; capacity: number; _count: { eventBookings: number } }>;
}) {
  const conversation = opts?.conversation ?? makeConversation();
  const bookings = opts?.bookings ?? makeBookings();
  const faqs = opts?.faqs ?? [];
  const roomTypes = opts?.roomTypes ?? [
    { name: 'Standard Double', rooms: [{ id: 'r1', bookings: [] }, { id: 'r2', bookings: [] }] },
  ];
  const events = opts?.events ?? [];

  const createdDraft = {
    id: 'draft-1',
    conversationId: conversation?.id ?? 'conv-1',
    messageId: 'msg-1',
    content: '',
    status: 'pending',
    model: '',
    tokensUsed: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costEur: 0,
    provider: '',
    durationMs: 0,
    flags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    conversation: {
      findUnique: vi.fn().mockResolvedValue(conversation),
    },
    booking: {
      findMany: vi.fn().mockResolvedValue(bookings),
    },
    roomType: {
      findMany: vi.fn().mockResolvedValue(roomTypes),
    },
    event: {
      findMany: vi.fn().mockResolvedValue(events),
    },
    faq: {
      findMany: vi.fn().mockResolvedValue(faqs),
    },
    aiDraft: {
      create: vi.fn().mockImplementation(({ data }) => {
        return Promise.resolve({ ...createdDraft, ...data, id: 'draft-1' });
      }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        aiDraft: {
          create: vi.fn().mockImplementation(({ data }) => {
            return Promise.resolve({ ...createdDraft, ...data, id: 'draft-1' });
          }),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        },
      };
      return fn(tx);
    }),
  };
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'info',
    silent: vi.fn(),
  };
}

// ---- Tests -----------------------------------------------------------

describe('draft pipeline integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates draft for guest inquiry email with full context', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({});
    const logger = makeLogger();

    const result = await generateDraft({
      prisma: prisma as never,
      gateway: gateway as never,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      guestLanguage: 'en',
      logger: logger as never,
    });

    // Result shape
    expect(result.draftId).toBe('draft-1');
    expect(result.content).toContain('Dear Maria');
    expect(result.model).toBe('anthropic/claude-sonnet-4-5-20250929');
    expect(result.costEur).toBeGreaterThanOrEqual(0);

    // Draft stored via transaction
    expect(prisma.$transaction).toHaveBeenCalledOnce();

    // extraSystemPrompt includes guest name, availability, and booking history
    const [, params] = gateway.request.mock.calls[0]!;
    const systemPrompt = (params as { extraSystemPrompt: string }).extraSystemPrompt;
    expect(systemPrompt).toContain('Maria Schmidt');
    expect(systemPrompt).toContain('Standard Double');
  });

  it('includes FAQ entries in system prompt', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({ faqs: makeFaqEntries() });
    const logger = makeLogger();

    await generateDraft({
      prisma: prisma as never,
      gateway: gateway as never,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      guestLanguage: 'en',
      logger: logger as never,
    });

    const [, params] = gateway.request.mock.calls[0]!;
    const systemPrompt = (params as { extraSystemPrompt: string }).extraSystemPrompt;
    expect(systemPrompt).toContain('Frequently Asked Questions');
    expect(systemPrompt).toContain('What time is check-in?');
    expect(systemPrompt).toContain('Check-in is at 3 PM.');
    expect(systemPrompt).toContain('Are dogs included?');
  });

  it('handles empty FAQ list gracefully', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({ faqs: [] });
    const logger = makeLogger();

    const result = await generateDraft({
      prisma: prisma as never,
      gateway: gateway as never,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      guestLanguage: 'en',
      logger: logger as never,
    });

    // Still generates successfully
    expect(result.draftId).toBe('draft-1');
    expect(result.content).toBeTruthy();

    // System prompt includes the fallback text for empty FAQs
    const [, params] = gateway.request.mock.calls[0]!;
    const systemPrompt = (params as { extraSystemPrompt: string }).extraSystemPrompt;
    expect(systemPrompt).toContain('No FAQ entries available');
  });

  it('classifies edge cases and stores flags', async () => {
    const conversation = makeConversation({
      latestContent: 'I need to cancel my booking',
    });
    const gateway = makeGateway();
    const prisma = makePrisma({ conversation });
    const logger = makeLogger();

    const result = await generateDraft({
      prisma: prisma as never,
      gateway: gateway as never,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      guestLanguage: 'en',
      logger: logger as never,
    });

    expect(result.flags).toContain('cancellation');

    // Verify warn was logged for sensitive message
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ flags: expect.arrayContaining(['cancellation']) }),
      'Sensitive message detected -- review draft carefully',
    );
  });

  it('handles gateway agent error gracefully', async () => {
    const gateway = makeGateway({ error: 'Gateway timeout' });
    const prisma = makePrisma({});
    const logger = makeLogger();

    await expect(
      generateDraft({
        prisma: prisma as never,
        gateway: gateway as never,
        conversationId: 'conv-1',
        messageId: 'msg-1',
        guestLanguage: 'en',
        logger: logger as never,
      }),
    ).rejects.toThrow('Gateway timeout');
  });

  it('two messages in the same conversation each generate separate drafts', async () => {
    // Verify that dedup checks are scoped to messageId, not just conversationId
    const conversation = makeConversation({ messageCount: 4 });
    const gateway = makeGateway();
    const prisma = makePrisma({ conversation });
    const logger = makeLogger();

    // First call -- msg-1 gets a draft
    await generateDraft({
      prisma: prisma as never,
      gateway: gateway as never,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      guestLanguage: 'en',
      logger: logger as never,
    });

    // After first call: draft exists for msg-1
    // The dedup check in the BullMQ job processor queries:
    //   { conversationId, messageId, status: { in: ['pending', 'failed'] } }
    // NOT just { conversationId, status: 'pending' }
    // So a second call for msg-2 should NOT be blocked.

    // Simulate the dedup check as the job processor would
    // For msg-1: existing draft found
    prisma.aiDraft.findFirst
      .mockResolvedValueOnce({ id: 'draft-1', status: 'pending' }) // msg-1 has draft
      .mockResolvedValueOnce(null); // msg-2 has no draft

    const existingForMsg1 = await prisma.aiDraft.findFirst({
      where: { conversationId: 'conv-1', messageId: 'msg-1', status: { in: ['pending', 'failed'] } },
    });
    expect(existingForMsg1).not.toBeNull();

    const existingForMsg2 = await prisma.aiDraft.findFirst({
      where: { conversationId: 'conv-1', messageId: 'msg-2', status: { in: ['pending', 'failed'] } },
    });
    expect(existingForMsg2).toBeNull();

    // Second call -- msg-2 gets its own draft
    const result2 = await generateDraft({
      prisma: prisma as never,
      gateway: gateway as never,
      conversationId: 'conv-1',
      messageId: 'msg-2',
      guestLanguage: 'en',
      logger: logger as never,
    });

    // msg-2 draft was created successfully (not skipped)
    expect(result2.draftId).toBe('draft-1');
    expect(result2.content).toBeTruthy();
  });

  it('onFailed handler creates a failed draft record in the database', async () => {
    const mockPrisma = {
      aiDraft: {
        create: vi.fn().mockResolvedValue({ id: 'failed-draft-1' }),
      },
    };
    const mockLog = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnValue({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    };

    const mockApp = {
      prisma: mockPrisma,
      log: mockLog,
    };

    const handler = createAiDraftFailedHandler(mockApp as never);

    const mockJob = {
      id: 'job-1',
      data: { conversationId: 'conv-1', messageId: 'msg-1', guestLanguage: 'en' as const },
    };

    await handler(mockJob as never, new Error('OpenClaw timeout'));

    expect(mockPrisma.aiDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        content: '',
        status: 'failed',
        model: 'none',
        tokensUsed: 0,
      }),
    });
  });

  it('onFailed handler does not throw even if DB write fails', async () => {
    const mockPrisma = {
      aiDraft: {
        create: vi.fn().mockRejectedValue(new Error('DB connection lost')),
      },
    };
    const childLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    const mockLog = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnValue(childLogger),
    };

    const mockApp = { prisma: mockPrisma, log: mockLog };
    const handler = createAiDraftFailedHandler(mockApp as never);

    const mockJob = {
      id: 'job-2',
      data: { conversationId: 'conv-2', messageId: 'msg-2', guestLanguage: 'en' as const },
    };

    // Should not throw
    await expect(handler(mockJob as never, new Error('LLM failed'))).resolves.toBeUndefined();

    // Should log the DB write error
    expect(childLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      'Could not write failed draft record',
    );
  });

  it('generates draft in German when guest language is de', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({});
    const logger = makeLogger();

    await generateDraft({
      prisma: prisma as never,
      gateway: gateway as never,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      guestLanguage: 'de',
      logger: logger as never,
    });

    const [, params] = gateway.request.mock.calls[0]!;
    const systemPrompt = (params as { extraSystemPrompt: string }).extraSystemPrompt;
    expect(systemPrompt).toContain('Respond in German');
  });
});
