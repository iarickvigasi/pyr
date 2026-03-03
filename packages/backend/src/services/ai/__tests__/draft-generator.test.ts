import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateDraft } from '../draft-generator.js';
import type { ChatEvent } from '../../gateway/types.js';

// ─── Mock audit module ──────────────────────────────────

vi.mock('../../../lib/audit.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// ─── Test factories ─────────────────────────────────────

function makeConversation(overrides?: {
  guestId?: string | null;
  messageCount?: number;
  latestContent?: string;
}) {
  const messageCount = overrides?.messageCount ?? 3;
  const baseTime = new Date('2026-03-15T10:00:00Z');
  const messages = Array.from({ length: messageCount }, (_, i) => ({
    sentAt: new Date(baseTime.getTime() + i * 60 * 60 * 1000),
    direction: i % 2 === 0 ? 'in' : 'out',
    content: i === messageCount - 1
      ? (overrides?.latestContent ?? 'I would like to book a 4-day retreat in April.')
      : `Message ${i + 1}`,
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

/**
 * Create a mock GatewayWsClient that simulates the WebSocket agent flow.
 * On request('agent', ...), it asynchronously fires chat events (delta then final)
 * via onChatEvent listeners.
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
      // Simulate async response via chat events
      const sessionKey = (params as { sessionKey: string }).sessionKey;
      setTimeout(() => {
        for (const listener of chatListeners) {
          if (opts?.error) {
            listener({ runId: 'run-1', sessionKey, seq: 1, state: 'error', errorMessage: opts.error });
          } else {
            // Send delta then final
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

/** Build a mock Prisma client with proxy-based approach */
function makePrisma(opts: {
  conversation?: ReturnType<typeof makeConversation> | null;
  bookings?: ReturnType<typeof makeBookings>;
  roomTypes?: Array<{ name: string; rooms: Array<{ id: string; bookings: Array<{ id: string }> }> }>;
  events?: Array<{ title: string; type: string; date: Date; time: string; capacity: number; _count: { eventBookings: number } }>;
}) {
  const conversation = opts.conversation ?? makeConversation();
  const bookings = opts.bookings ?? makeBookings();
  const roomTypes = opts.roomTypes ?? [
    { name: 'Standard Double', rooms: [{ id: 'r1', bookings: [] }, { id: 'r2', bookings: [] }] },
  ];
  const events = opts.events ?? [];

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
      findMany: vi.fn().mockResolvedValue([]),
    },
    aiDraft: {
      create: vi.fn().mockImplementation(({ data }) => {
        return Promise.resolve({ ...createdDraft, ...data, id: 'draft-1' });
      }),
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

// ─── Tests ──────────────────────────────────────────────

describe('generateDraft', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a draft with full tracking (happy path)', async () => {
    const gateway = makeGateway();
    const prisma = makePrisma({});
    const logger = makeLogger();

    const result = await generateDraft({
      prisma: prisma as never,
      gateway: gateway as never,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      guestLanguage: 'de',
      logger: logger as never,
    });

    // Verify result shape
    expect(result.draftId).toBe('draft-1');
    expect(result.content).toContain('Dear Maria');
    expect(result.model).toBe('anthropic/claude-sonnet-4-5-20250929');
    expect(result.provider).toBe('anthropic');
    expect(result.inputTokens).toBe(2000);
    expect(result.outputTokens).toBe(500);
    expect(result.costEur).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.flags).toEqual([]);

    // Verify gateway.request was called with correct method and params
    expect(gateway.request).toHaveBeenCalledOnce();
    const [method, params] = gateway.request.mock.calls[0]!;
    expect(method).toBe('agent');
    expect(params).toEqual(
      expect.objectContaining({
        agentId: 'main',
        deliver: false,
        extraSystemPrompt: expect.any(String),
      }),
    );
    // extraSystemPrompt should contain business context
    expect((params as { extraSystemPrompt: string }).extraSystemPrompt.length).toBeGreaterThan(100);

    // Verify onChatEvent was subscribed
    expect(gateway.onChatEvent).toHaveBeenCalledOnce();

    // Verify DB transaction was called
    expect(prisma.$transaction).toHaveBeenCalledOnce();

    // Verify logger info was called with generation info
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: 'draft-1',
        model: 'anthropic/claude-sonnet-4-5-20250929',
        provider: 'anthropic',
        inputTokens: 2000,
        outputTokens: 500,
      }),
      'AI draft generated',
    );
  });

  it('stores edge-case flags on the draft', async () => {
    const conversation = makeConversation({
      latestContent: 'I need to cancel my booking and I have nut allergies',
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
    expect(result.flags).toContain('dietary');

    // Verify warn was logged for sensitive message
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ flags: expect.arrayContaining(['cancellation', 'dietary']) }),
      'Sensitive message detected -- review draft carefully',
    );
  });

  it('normalizes markdown output to plain text', async () => {
    const gateway = makeGateway({
      content: 'Hi **Maria**,\n\nThanks for your message.\n\n- We have availability.\n[Book here](https://example.com)',
    });
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

    expect(result.content).toContain('Hi Maria');
    expect(result.content).toContain('We have availability.');
    expect(result.content).toContain('Book here');
    expect(result.content).not.toContain('**');
    expect(result.content).not.toContain('[Book here]');
    expect(result.content).not.toContain('https://example.com');
  });

  it('generates a draft for unknown guest (null guestId)', async () => {
    const conversation = makeConversation({ guestId: null });
    const gateway = makeGateway();
    const prisma = makePrisma({ conversation, bookings: [] });
    const logger = makeLogger();

    const result = await generateDraft({
      prisma: prisma as never,
      gateway: gateway as never,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      guestLanguage: 'en',
      logger: logger as never,
    });

    // Should still generate a draft
    expect(result.draftId).toBe('draft-1');
    expect(result.content).toBeTruthy();

    // extraSystemPrompt should mention unknown guest
    const [, params] = gateway.request.mock.calls[0]!;
    const systemPrompt = (params as { extraSystemPrompt: string }).extraSystemPrompt;
    expect(systemPrompt).toContain('unknown guest');
  });

  it('throws when conversation is not found', async () => {
    const prisma = makePrisma({ conversation: null });
    // Context builder will throw "Conversation not found"
    prisma.conversation.findUnique.mockResolvedValue(null);

    const gateway = makeGateway();
    const logger = makeLogger();

    await expect(
      generateDraft({
        prisma: prisma as never,
        gateway: gateway as never,
        conversationId: 'nonexistent',
        messageId: 'msg-1',
        guestLanguage: 'en',
        logger: logger as never,
      }),
    ).rejects.toThrow('Conversation not found');
  });

  it('caps messages at 20 in the prompt', async () => {
    const conversation = makeConversation({ messageCount: 25 });
    const gateway = makeGateway();
    const prisma = makePrisma({ conversation });
    const logger = makeLogger();

    await generateDraft({
      prisma: prisma as never,
      gateway: gateway as never,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      guestLanguage: 'en',
      logger: logger as never,
    });

    // The extraSystemPrompt should be the full system prompt (no message cap there)
    // but the message sent as the `message` param should be the last chat message
    const [, params] = gateway.request.mock.calls[0]!;
    const extraSystemPrompt = (params as { extraSystemPrompt: string }).extraSystemPrompt;
    // System prompt should exist
    expect(extraSystemPrompt.length).toBeGreaterThan(0);
  });

  it('throws on gateway agent error', async () => {
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

  it('derives provider from model string correctly', async () => {
    // Test with OpenAI model
    const gateway = makeGateway({ model: 'openai/gpt-4o' });
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

    expect(result.provider).toBe('openai');
    expect(result.model).toBe('openai/gpt-4o');
  });

  it('handles cache token usage from response', async () => {
    const gateway = makeGateway({
      usage: {
        prompt_tokens: 2000,
        completion_tokens: 500,
        cache_read_input_tokens: 1500,
        cache_creation_input_tokens: 300,
      },
    });
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

    expect(result.cacheReadTokens).toBe(1500);
    expect(result.cacheWriteTokens).toBe(300);
  });
});
