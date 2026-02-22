import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Shared mock IMAP instance (configured per test in beforeEach) ─────
const mockPollNewEmails = vi.fn();

// ─── Mock all external dependencies before imports ──────────

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

// ─── Imports ────────────────────────────────────────────────

import { createEmailModule } from '../index.js';
import { getSetting } from '../../../modules/settings/settings.service.js';
import { parseOtaEmail } from '../ota-parsers/index.js';
import type { FastifyInstance } from 'fastify';

const mockedGetSetting = vi.mocked(getSetting);
const mockedParseOtaEmail = vi.mocked(parseOtaEmail);

// ─── OTA Tripaneer MIME helper ──────────────────────────────

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

// ─── Mock Prisma Factory ────────────────────────────────────

function createMockPrisma() {
  let msgCounter = 0;
  let convCounter = 0;
  let guestCounter = 0;
  let bookingCounter = 0;

  return {
    message: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        msgCounter++;
        return {
          id: `msg-${msgCounter}`,
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
      create: vi.fn(async () => {
        convCounter++;
        return {
          id: `conv-${convCounter}`,
          guestId: null,
          channel: 'email',
          subject: 'New Booking: Test Guest',
          classification: 'ota_notification',
          lastMessageAt: new Date(),
        };
      }),
      update: vi.fn().mockResolvedValue({}),
    },

    guest: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        guestCounter++;
        return {
          id: `guest-${guestCounter}`,
          name: args.data.name ?? '',
          email: args.data.email ?? '',
          language: 'en',
          source: args.data.source ?? 'email',
        };
      }),
    },

    room: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'room-1',
        name: 'Suite A',
        status: 'available',
      }),
    },

    booking: {
      create: vi.fn(async () => {
        bookingCounter++;
        return {
          id: `booking-${bookingCounter}`,
          guestId: 'guest-1',
          roomId: 'room-1',
          status: 'inquiry',
          checkIn: new Date(),
          checkOut: new Date(Date.now() + 86_400_000),
        };
      }),
    },

    attachment: {
      create: vi.fn(),
    },

    setting: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },

    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txProxy = new Proxy(
        {},
        {
          get: (_target, prop) => {
            if (prop === 'guest') {
              return {
                create: async (createArgs: { data: Record<string, unknown> }) => {
                  guestCounter++;
                  return {
                    id: `guest-${guestCounter}`,
                    name: createArgs.data.name ?? '',
                    email: createArgs.data.email ?? null,
                    source: createArgs.data.source ?? 'email',
                  };
                },
              };
            }
            if (prop === 'booking') {
              return {
                create: async () => {
                  bookingCounter++;
                  return {
                    id: `booking-${bookingCounter}`,
                    guestId: 'guest-1',
                    roomId: 'room-1',
                    status: 'inquiry',
                  };
                },
              };
            }
            if (prop === 'auditLog') {
              return { create: vi.fn() };
            }
            return undefined;
          },
        },
      );
      return fn(txProxy);
    }),
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe('OTA booking calendar sync', () => {
  let mockCalQueueAdd: ReturnType<typeof vi.fn>;
  let mockGetQueue: ReturnType<typeof vi.fn>;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockApp: unknown;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCalQueueAdd = vi.fn().mockResolvedValue(undefined);
    mockGetQueue = vi.fn().mockReturnValue({ add: mockCalQueueAdd });
    mockPrisma = createMockPrisma();

    // Configure getSetting to throw (not found) to trigger env var fallback
    mockedGetSetting.mockRejectedValue(new Error('not found'));

    // Configure OTA parser to return booking data
    mockedParseOtaEmail.mockReturnValue({
      guestName: 'Test Guest',
      guestEmail: 'guest@example.com',
      checkIn: '2026-03-15',
      checkOut: '2026-03-19',
      packageName: '4-Day Retreat',
      totalPrice: 85000,
      otaPlatform: 'tripaneer',
      otaReferenceId: 'TR-99999',
      needsReview: false,
      parseErrors: [],
      rawFields: {},
    });

    // Set up mock IMAP to return a Tripaneer email
    mockPollNewEmails.mockResolvedValue([
      { uid: 100, source: buildTripaneerMime() },
    ]);

    // Build mock FastifyInstance
    mockApp = {
      prisma: mockPrisma,
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

  it('should enqueue calendar-sync job after OTA booking creation', async () => {
    const emailModule = createEmailModule(mockApp as FastifyInstance);
    await emailModule.pollInbox();

    // Verify calendar-sync queue was requested
    expect(mockGetQueue).toHaveBeenCalledWith('calendar-sync');

    // Verify calendar-sync job was enqueued with correct data
    expect(mockCalQueueAdd).toHaveBeenCalledWith('calendar-sync', {
      entityType: 'booking',
      entityId: expect.any(String),
      action: 'create',
    });
  });

  it('should enqueue calendar sync AFTER the booking transaction commits', async () => {
    const callOrder: string[] = [];

    // Track when $transaction resolves
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txProxy = new Proxy(
        {},
        {
          get: (_target, prop) => {
            if (prop === 'guest') {
              return {
                create: async (createArgs: { data: Record<string, unknown> }) => ({
                  id: 'guest-tx-1',
                  name: createArgs.data.name ?? '',
                  email: createArgs.data.email ?? null,
                  source: createArgs.data.source ?? 'email',
                }),
              };
            }
            if (prop === 'booking') {
              return {
                create: async () => ({
                  id: 'booking-tx-1',
                  guestId: 'guest-tx-1',
                  roomId: 'room-1',
                  status: 'inquiry',
                }),
              };
            }
            if (prop === 'auditLog') {
              return { create: vi.fn() };
            }
            return undefined;
          },
        },
      );
      const result = await fn(txProxy);
      callOrder.push('transaction-commit');
      return result;
    });

    mockCalQueueAdd.mockImplementation(async () => {
      callOrder.push('calendar-sync-enqueued');
    });

    const emailModule = createEmailModule(mockApp as FastifyInstance);
    await emailModule.pollInbox();

    // Verify the order: transaction commits before calendar sync enqueue
    // Two transactions: one for guest creation, one for booking creation
    expect(callOrder).toEqual(['transaction-commit', 'transaction-commit', 'calendar-sync-enqueued']);
  });

  it('should NOT block email processing when calendar sync enqueue fails', async () => {
    // Make calendar sync enqueue throw
    mockCalQueueAdd.mockRejectedValue(new Error('Redis connection lost'));

    const emailModule = createEmailModule(mockApp as FastifyInstance);
    const processed = await emailModule.pollInbox();

    // Email should still be processed successfully
    expect(processed).toBe(1);

    // Error should be logged but not thrown
    expect((mockApp as { log: { error: ReturnType<typeof vi.fn> } }).log.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), bookingId: expect.any(String) }),
      'Failed to enqueue calendar sync for OTA booking',
    );
  });

  it('should handle missing calendar-sync queue gracefully', async () => {
    // Queue not available
    mockGetQueue.mockReturnValue(null);

    const emailModule = createEmailModule(mockApp as FastifyInstance);
    const processed = await emailModule.pollInbox();

    // Email should still be processed
    expect(processed).toBe(1);

    // calQueue.add should NOT have been called
    expect(mockCalQueueAdd).not.toHaveBeenCalled();
  });
});
