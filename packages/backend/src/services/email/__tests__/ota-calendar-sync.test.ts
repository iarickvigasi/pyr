import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared IMAP mock
const mockPollNewEmails = vi.fn();

vi.mock('imapflow', () => ({
  ImapFlow: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn(),
      verify: vi.fn(),
    })),
  },
}));

vi.mock('../imap.service.js', () => ({
  createImapService: vi.fn(() => ({
    pollNewEmails: mockPollNewEmails,
  })),
}));

vi.mock('../../../modules/settings/settings.service.js', () => ({
  getSetting: vi.fn(),
  getEmailProviderConfig: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../lib/audit.js', () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock('../ota-parsers/index.js', () => ({
  parseOtaEmail: vi.fn(),
}));

import { createEmailModule } from '../index.js';
import { getSetting } from '../../../modules/settings/settings.service.js';
import { parseOtaEmail } from '../ota-parsers/index.js';
import type { FastifyInstance } from 'fastify';
import { QUEUE_NAMES } from '@pyr/shared';

const mockedGetSetting = vi.mocked(getSetting);
const mockedParseOtaEmail = vi.mocked(parseOtaEmail);

function buildTripaneerMime(): Buffer {
  const lines: string[] = [];
  lines.push('From: <noreply@tripaneer.com>');
  lines.push('To: <puppyyogaretreat@gmx.de>');
  lines.push('Subject: New Booking: Test Guest');
  lines.push('Message-ID: <ota-test-001@tripaneer.com>');
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/html; charset=utf-8');
  lines.push('');
  lines.push('<div><p>Guest name: Test Guest</p><p>Email: guest@example.com</p></div>');
  return Buffer.from(lines.join('\r\n'));
}

function buildViatorMime(): Buffer {
  const lines: string[] = [];
  lines.push('From: Viator <booking@notifications.viator.com>');
  lines.push('To: <puppyyogaretreat@gmx.de>');
  lines.push('Subject: Booking cancelled #BR-1369156715');
  lines.push('Message-ID: <viator-test-001@viator.com>');
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset=utf-8');
  lines.push('');
  lines.push('Viator cancellation for booking reference BR-1369156715');
  return Buffer.from(lines.join('\r\n'));
}

function buildConversationMime(): Buffer {
  const lines: string[] = [];
  lines.push('From: Anna <anna@example.com>');
  lines.push('To: <puppyyogaretreat@gmx.de>');
  lines.push('Subject: Question about availability');
  lines.push('Message-ID: <conv-test-001@example.com>');
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset=utf-8');
  lines.push('');
  lines.push('Hi, do you have availability from March 10 to March 15?');
  return Buffer.from(lines.join('\r\n'));
}

function createGatewayMock(jsonPayload: unknown) {
  const listeners: Array<(event: unknown) => void> = [];
  return {
    get isConnected() {
      return true;
    },
    onChatEvent: vi.fn((handler: (event: unknown) => void) => {
      listeners.push(handler);
      return () => {};
    }),
    request: vi.fn().mockImplementation(async (_method: string, params: unknown) => {
      const sessionKey = (params as { sessionKey: string }).sessionKey;
      const event = {
        runId: 'run-1',
        sessionKey: `agent:main:${sessionKey}`,
        seq: 1,
        state: 'final',
        message: {
          content: JSON.stringify(jsonPayload),
          snapshot: true,
        },
      };
      for (const listener of listeners) listener(event);
      return { ok: true };
    }),
  };
}

function createMockPrisma() {
  let messageCounter = 0;
  let conversationCounter = 0;

  return {
    message: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        messageCounter += 1;
        return {
          id: `msg-${messageCounter}`,
          conversationId: args.data.conversationId,
          messageId: args.data.messageId ?? null,
          direction: args.data.direction ?? 'in',
          content: args.data.content ?? '',
          channel: 'email',
          fromAddress: args.data.fromAddress ?? null,
          subject: args.data.subject ?? null,
          classification: args.data.classification ?? null,
          sentAt: args.data.sentAt ?? new Date(),
          createdAt: new Date(),
        };
      }),
    },

    conversation: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        conversationCounter += 1;
        return {
          id: `conv-${conversationCounter}`,
          guestId: (args.data.guestId as string) ?? null,
          channel: 'email',
          subject: args.data.subject,
          classification: args.data.classification,
          lastMessageAt: args.data.lastMessageAt,
        };
      }),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },

    guest: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },

    booking: {
      create: vi.fn(),
    },

    attachment: {
      create: vi.fn(),
    },

    setting: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    conversationEventAnalysis: {
      upsert: vi.fn().mockResolvedValue({
        id: 'analysis-1',
        conversationId: 'conv-1',
        messageId: 'msg-1',
        provider: 'viator',
        status: 'pending',
        reason: 'Queued from inbound Viator email ingestion',
        classification: 'ota_other',
        intent: null,
        missingFields: [],
        candidateJson: null,
        resolutionJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
  };
}

describe('OTA booking calendar sync', () => {
  let mockQueueAdds: Record<string, ReturnType<typeof vi.fn>>;
  let mockGetQueue: ReturnType<typeof vi.fn>;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockApp: unknown;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQueueAdds = {
      [QUEUE_NAMES.AI_DRAFT]: vi.fn().mockResolvedValue({ id: 'ai-job-1' }),
      [QUEUE_NAMES.INBOX_TELEGRAM_NOTIFY]: vi.fn().mockResolvedValue({ id: 'inbox-notify-job-1' }),
      [QUEUE_NAMES.VIATOR_EVENT_ANALYSIS]: vi.fn().mockResolvedValue({ id: 'viator-job-1' }),
    };
    mockGetQueue = vi.fn((queueName: string) => {
      const add = mockQueueAdds[queueName];
      if (!add) return undefined;
      return { add };
    });
    mockPrisma = createMockPrisma();

    mockedGetSetting.mockRejectedValue(new Error('not found'));
    process.env.NOTIFY_TELEGRAM_ENABLED = 'true';
    process.env.NOTIFY_TELEGRAM_OWNER_USER_ID = '130414078';
    process.env.NOTIFY_INBOX_SCOPE = 'conversation,ota';

    mockedParseOtaEmail.mockReturnValue({
      guestName: 'Test Guest',
      guestEmail: 'guest@example.com',
      guestPhone: null,
      checkIn: '2026-03-15',
      checkOut: '2026-03-19',
      packageName: '4-Day Retreat',
      totalPrice: 85000,
      currency: 'EUR',
      otaPlatform: 'tripaneer',
      otaReferenceId: 'TR-99999',
      needsReview: false,
      parseErrors: [],
      rawFields: {},
    });

    mockPollNewEmails.mockResolvedValue([{ uid: 100, source: buildTripaneerMime() }]);

    mockApp = {
      prisma: mockPrisma,
      gateway: createGatewayMock({
        category: 'ota_tripaneer',
        confidence: 0.96,
        reason: 'Tripaneer OTA sender',
        suggestion: {
          name: null,
          email: null,
          phone: null,
          shouldCreate: false,
        },
      }),
      log: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      queues: {
        getQueue: mockGetQueue,
      },
    };
  });

  it('processes OTA emails without enqueuing calendar-sync side effects', async () => {
    const emailModule = createEmailModule(mockApp as FastifyInstance);
    const processed = await emailModule.pollInbox();

    expect(processed).toBe(1);
    expect(mockGetQueue).not.toHaveBeenCalledWith('calendar-sync');
  });

  it('does not auto-create guest or booking records from OTA ingestion', async () => {
    const emailModule = createEmailModule(mockApp as FastifyInstance);
    const processed = await emailModule.pollInbox();

    expect(processed).toBe(1);
    expect(mockPrisma.guest.create).not.toHaveBeenCalled();
    expect(mockPrisma.booking.create).not.toHaveBeenCalled();
  });

  it('stores OTA conversation/message with OTA classification', async () => {
    const emailModule = createEmailModule(mockApp as FastifyInstance);
    const processed = await emailModule.pollInbox();

    expect(processed).toBe(1);
    expect(mockPrisma.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          classification: 'ota_tripaneer',
        }),
      }),
    );
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          classification: 'ota_tripaneer',
        }),
      }),
    );
  });

  it('still processes OTA email when OTA parser returns null', async () => {
    mockedParseOtaEmail.mockReturnValueOnce(null);

    const emailModule = createEmailModule(mockApp as FastifyInstance);
    const processed = await emailModule.pollInbox();

    expect(processed).toBe(1);
    expect(mockPrisma.conversation.create).toHaveBeenCalled();
    expect(mockPrisma.message.create).toHaveBeenCalled();
    expect(mockPrisma.guest.create).not.toHaveBeenCalled();
    expect(mockPrisma.booking.create).not.toHaveBeenCalled();
  });

  it('queues Viator event analysis and stores pending state for Viator inbound', async () => {
    mockPollNewEmails.mockResolvedValueOnce([{ uid: 101, source: buildViatorMime() }]);
    (mockApp as { gateway: ReturnType<typeof createGatewayMock> }).gateway = createGatewayMock({
      category: 'ota_other',
      confidence: 0.92,
      reason: 'Viator OTA notification',
      suggestion: {
        name: null,
        email: null,
        phone: null,
        shouldCreate: false,
      },
    });

    const emailModule = createEmailModule(mockApp as FastifyInstance);
    const processed = await emailModule.pollInbox();

    expect(processed).toBe(1);
    expect(mockPrisma.conversationEventAnalysis.upsert).toHaveBeenCalledTimes(1);
    expect(mockGetQueue).toHaveBeenCalledWith(QUEUE_NAMES.VIATOR_EVENT_ANALYSIS);
    expect(mockQueueAdds[QUEUE_NAMES.VIATOR_EVENT_ANALYSIS]).toHaveBeenCalledWith(
      'viator-event-analysis',
      expect.objectContaining({
        conversationId: 'conv-1',
        messageId: 'msg-1',
      }),
      expect.objectContaining({
        jobId: 'viator-event-analysis:msg-1',
      }),
    );
    expect(mockGetQueue).toHaveBeenCalledWith(QUEUE_NAMES.INBOX_TELEGRAM_NOTIFY);
    expect(mockQueueAdds[QUEUE_NAMES.INBOX_TELEGRAM_NOTIFY]).toHaveBeenCalledWith(
      'inbox-telegram-notify',
      expect.objectContaining({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        classification: 'ota_other',
      }),
      expect.objectContaining({
        jobId: expect.stringContaining('inbox-telegram-notify-'),
      }),
    );
  });

  it('queues inbox telegram notification for conversation emails', async () => {
    mockPollNewEmails.mockResolvedValueOnce([{ uid: 102, source: buildConversationMime() }]);
    (mockApp as { gateway: ReturnType<typeof createGatewayMock> }).gateway = createGatewayMock({
      category: 'conversation',
      confidence: 0.95,
      reason: 'Guest question',
      suggestion: {
        name: 'Anna',
        email: 'anna@example.com',
        phone: null,
        shouldCreate: false,
      },
    });

    const emailModule = createEmailModule(mockApp as FastifyInstance);
    const processed = await emailModule.pollInbox();

    expect(processed).toBe(1);
    expect(mockGetQueue).toHaveBeenCalledWith(QUEUE_NAMES.INBOX_TELEGRAM_NOTIFY);
    expect(mockQueueAdds[QUEUE_NAMES.INBOX_TELEGRAM_NOTIFY]).toHaveBeenCalledWith(
      'inbox-telegram-notify',
      expect.objectContaining({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        classification: 'conversation',
      }),
      expect.objectContaining({
        jobId: 'inbox-telegram-notify-_conv-test-001_example_com_',
      }),
    );
  });

  it('does not queue inbox telegram notification when classification is other', async () => {
    mockPollNewEmails.mockResolvedValueOnce([{ uid: 103, source: buildConversationMime() }]);
    (mockApp as { gateway: ReturnType<typeof createGatewayMock> }).gateway = createGatewayMock({
      category: 'other',
      confidence: 0.8,
      reason: 'Not customer-facing',
      suggestion: {
        name: null,
        email: null,
        phone: null,
        shouldCreate: false,
      },
    });

    const emailModule = createEmailModule(mockApp as FastifyInstance);
    const processed = await emailModule.pollInbox();

    expect(processed).toBe(1);
    expect(mockQueueAdds[QUEUE_NAMES.INBOX_TELEGRAM_NOTIFY]).not.toHaveBeenCalled();
  });
});
