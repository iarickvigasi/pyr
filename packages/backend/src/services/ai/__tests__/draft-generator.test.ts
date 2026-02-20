import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateDraft } from '../draft-generator.js';

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

function makeOpenClawResponse(overrides?: {
  content?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}) {
  return {
    choices: [
      {
        message: {
          content: overrides?.content ?? 'Dear Maria, thank you for your interest in our retreat! We would love to welcome you in April. Warm regards, Ines',
        },
      },
    ],
    model: overrides?.model ?? 'anthropic/claude-sonnet-4-5-20250929',
    usage: {
      prompt_tokens: overrides?.promptTokens ?? 2000,
      completion_tokens: overrides?.completionTokens ?? 500,
      ...(overrides?.cacheReadTokens !== undefined && { cache_read_input_tokens: overrides.cacheReadTokens }),
      ...(overrides?.cacheCreationTokens !== undefined && { cache_creation_input_tokens: overrides.cacheCreationTokens }),
    },
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

function makeConfig() {
  return {
    openclawGatewayUrl: 'http://localhost:18789',
    openclawGatewayToken: 'test-token',
  };
}

// ─── Tests ──────────────────────────────────────────────

describe('generateDraft', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('generates a draft with full tracking (happy path)', async () => {
    const mockResponse = makeOpenClawResponse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));

    const prisma = makePrisma({});
    const logger = makeLogger();

    const result = await generateDraft({
      prisma: prisma as never,
      config: makeConfig(),
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

    // Verify fetch was called with correct URL and auth
    expect(fetch).toHaveBeenCalledOnce();
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    expect(fetchCall[0]).toBe('http://localhost:18789/v1/chat/completions');
    const fetchOpts = fetchCall[1] as RequestInit;
    expect(fetchOpts.headers).toEqual(
      expect.objectContaining({
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json',
      }),
    );

    // Verify message body includes system prompt and chat messages
    const body = JSON.parse(fetchOpts.body as string);
    expect(body.model).toBe('openclaw:main');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages.length).toBeGreaterThan(1);
    expect(body.max_tokens).toBe(2048);
    expect(body.temperature).toBe(0.5);

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
    const mockResponse = makeOpenClawResponse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));

    const prisma = makePrisma({ conversation });
    const logger = makeLogger();

    const result = await generateDraft({
      prisma: prisma as never,
      config: makeConfig(),
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

  it('generates a draft for unknown guest (null guestId)', async () => {
    const conversation = makeConversation({ guestId: null });
    const mockResponse = makeOpenClawResponse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));

    const prisma = makePrisma({ conversation, bookings: [] });
    const logger = makeLogger();

    const result = await generateDraft({
      prisma: prisma as never,
      config: makeConfig(),
      conversationId: 'conv-1',
      messageId: 'msg-1',
      guestLanguage: 'en',
      logger: logger as never,
    });

    // Should still generate a draft
    expect(result.draftId).toBe('draft-1');
    expect(result.content).toBeTruthy();

    // System prompt should mention unknown guest
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string);
    const systemPrompt = body.messages[0].content as string;
    expect(systemPrompt).toContain('unknown guest');
  });

  it('throws when conversation is not found', async () => {
    const prisma = makePrisma({ conversation: null });
    // Context builder will throw "Conversation not found"
    prisma.conversation.findUnique.mockResolvedValue(null);

    const logger = makeLogger();

    await expect(
      generateDraft({
        prisma: prisma as never,
        config: makeConfig(),
        conversationId: 'nonexistent',
        messageId: 'msg-1',
        guestLanguage: 'en',
        logger: logger as never,
      }),
    ).rejects.toThrow('Conversation not found');
  });

  it('caps messages at 20 in the prompt', async () => {
    const conversation = makeConversation({ messageCount: 25 });
    const mockResponse = makeOpenClawResponse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));

    const prisma = makePrisma({ conversation });
    const logger = makeLogger();

    await generateDraft({
      prisma: prisma as never,
      config: makeConfig(),
      conversationId: 'conv-1',
      messageId: 'msg-1',
      guestLanguage: 'en',
      logger: logger as never,
    });

    // The messages array in the fetch body should have system prompt + max 20 chat messages
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string);
    // First message is system prompt, rest are chat messages
    const chatMessages = body.messages.slice(1);
    expect(chatMessages.length).toBe(20);
  });

  it('throws on OpenClaw API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Gateway timeout'),
    }));

    const prisma = makePrisma({});
    const logger = makeLogger();

    await expect(
      generateDraft({
        prisma: prisma as never,
        config: makeConfig(),
        conversationId: 'conv-1',
        messageId: 'msg-1',
        guestLanguage: 'en',
        logger: logger as never,
      }),
    ).rejects.toThrow('OpenClaw API error: 500 Internal Server Error');
  });

  it('derives provider from model string correctly', async () => {
    // Test with OpenAI model
    const mockResponse = makeOpenClawResponse({ model: 'openai/gpt-4o' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));

    const prisma = makePrisma({});
    const logger = makeLogger();

    const result = await generateDraft({
      prisma: prisma as never,
      config: makeConfig(),
      conversationId: 'conv-1',
      messageId: 'msg-1',
      guestLanguage: 'en',
      logger: logger as never,
    });

    expect(result.provider).toBe('openai');
    expect(result.model).toBe('openai/gpt-4o');
  });

  it('handles cache token usage from response', async () => {
    const mockResponse = makeOpenClawResponse({
      cacheReadTokens: 1500,
      cacheCreationTokens: 300,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));

    const prisma = makePrisma({});
    const logger = makeLogger();

    const result = await generateDraft({
      prisma: prisma as never,
      config: makeConfig(),
      conversationId: 'conv-1',
      messageId: 'msg-1',
      guestLanguage: 'en',
      logger: logger as never,
    });

    expect(result.cacheReadTokens).toBe(1500);
    expect(result.cacheWriteTokens).toBe(300);
  });
});
