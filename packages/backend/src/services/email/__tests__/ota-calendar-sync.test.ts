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
  };
}

describe('OTA booking calendar sync', () => {
  let mockQueueAdd: ReturnType<typeof vi.fn>;
  let mockGetQueue: ReturnType<typeof vi.fn>;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockApp: unknown;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQueueAdd = vi.fn().mockResolvedValue(undefined);
    mockGetQueue = vi.fn().mockReturnValue({ add: mockQueueAdd });
    mockPrisma = createMockPrisma();

    mockedGetSetting.mockRejectedValue(new Error('not found'));

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
      gateway: {
        isConnected: false,
        onChatEvent: vi.fn(() => () => undefined),
        request: vi.fn(),
      },
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
    expect(mockQueueAdd).not.toHaveBeenCalledWith(
      'calendar-sync',
      expect.any(Object),
    );
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
});
