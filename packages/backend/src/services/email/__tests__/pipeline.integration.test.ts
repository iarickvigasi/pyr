import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('../../../modules/settings/settings.service.js', () => ({
  getSetting: vi.fn(),
}));

vi.mock('../../../lib/audit.js', () => ({
  writeAuditLog: vi.fn(),
}));

// ─── Imports ────────────────────────────────────────────────

import { getSetting } from '../../../modules/settings/settings.service.js';
import { writeAuditLog } from '../../../lib/audit.js';

const mockedGetSetting = vi.mocked(getSetting);
const mockedWriteAuditLog = vi.mocked(writeAuditLog);

// ─── MIME Message Helper ────────────────────────────────────

function buildMimeMessage(opts: {
  from?: string;
  fromName?: string;
  to?: string;
  subject?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  body?: string;
  html?: string;
  date?: string;
}): Buffer {
  const lines: string[] = [];
  lines.push(
    `From: ${opts.fromName ? `"${opts.fromName}" ` : ''}<${opts.from ?? 'test@example.com'}>`,
  );
  lines.push(`To: <${opts.to ?? 'puppyyogaretreat@gmx.de'}>`);
  lines.push(`Subject: ${opts.subject ?? 'Test'}`);
  if (opts.messageId) lines.push(`Message-ID: ${opts.messageId}`);
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references?.length) lines.push(`References: ${opts.references.join(' ')}`);
  lines.push(`Date: ${opts.date ?? new Date().toUTCString()}`);
  lines.push('MIME-Version: 1.0');

  if (opts.html) {
    lines.push('Content-Type: text/html; charset=utf-8');
    lines.push('');
    lines.push(opts.html);
  } else {
    lines.push('Content-Type: text/plain; charset=utf-8');
    lines.push('');
    lines.push(opts.body ?? 'Test email body');
  }

  return Buffer.from(lines.join('\r\n'));
}

// ─── Mock Prisma Factory ────────────────────────────────────

interface MockMessage {
  id: string;
  conversationId: string;
  messageId: string | null;
  direction: string;
  content: string;
  channel: string;
  fromAddress: string | null;
  subject: string | null;
  classification: string | null;
  sentAt: Date;
  createdAt: Date;
}

interface MockConversation {
  id: string;
  guestId: string | null;
  channel: string;
  subject: string | null;
  classification: string | null;
  lastMessageAt: Date | null;
}

interface MockGuest {
  id: string;
  name: string;
  email: string;
  language: string;
  source: string;
}

function createMockPrisma() {
  const messages: MockMessage[] = [];
  const conversations: MockConversation[] = [];
  const guests: MockGuest[] = [];
  let msgCounter = 0;
  let convCounter = 0;
  let guestCounter = 0;

  return {
    _data: { messages, conversations, guests },

    message: {
      findFirst: vi.fn(async (args: { where: { messageId: string }; select?: Record<string, boolean> }) => {
        const found = messages.find((m) => m.messageId === args.where.messageId);
        if (!found) return null;
        if (args.select?.conversationId) return { conversationId: found.conversationId };
        return found;
      }),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        msgCounter++;
        const msg: MockMessage = {
          id: `msg-${msgCounter}`,
          conversationId: args.data.conversationId as string,
          messageId: (args.data.messageId as string) ?? null,
          direction: (args.data.direction as string) ?? 'in',
          content: (args.data.content as string) ?? '',
          channel: (args.data.channel as string) ?? 'email',
          fromAddress: (args.data.fromAddress as string) ?? null,
          subject: (args.data.subject as string) ?? null,
          classification: (args.data.classification as string) ?? null,
          sentAt: (args.data.sentAt as Date) ?? new Date(),
          createdAt: new Date(),
        };
        messages.push(msg);
        return msg;
      }),
    },

    conversation: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        convCounter++;
        const conv: MockConversation = {
          id: `conv-${convCounter}`,
          guestId: (args.data.guestId as string) ?? null,
          channel: (args.data.channel as string) ?? 'email',
          subject: (args.data.subject as string) ?? null,
          classification: (args.data.classification as string) ?? null,
          lastMessageAt: (args.data.lastMessageAt as Date) ?? null,
        };
        conversations.push(conv);
        return conv;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const conv = conversations.find((c) => c.id === args.where.id);
        if (conv && args.data.lastMessageAt) {
          conv.lastMessageAt = args.data.lastMessageAt as Date;
        }
        return conv;
      }),
    },

    guest: {
      findFirst: vi.fn(async (args: { where: { email: string; deletedAt: null } }) => {
        return guests.find((g) => g.email === args.where.email) ?? null;
      }),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        guestCounter++;
        const guest: MockGuest = {
          id: `guest-${guestCounter}`,
          name: (args.data.name as string) ?? '',
          email: (args.data.email as string) ?? '',
          language: (args.data.language as string) ?? 'en',
          source: (args.data.source as string) ?? 'email',
        };
        guests.push(guest);
        return guest;
      }),
    },

    setting: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },

    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      // Provide a transaction proxy that delegates to the same mock arrays
      const txProxy = new Proxy(
        {},
        {
          get: (_target, prop) => {
            if (prop === 'guest') {
              return {
                create: async (createArgs: { data: Record<string, unknown> }) => {
                  guestCounter++;
                  const guest: MockGuest = {
                    id: `guest-${guestCounter}`,
                    name: (createArgs.data.name as string) ?? '',
                    email: (createArgs.data.email as string) ?? '',
                    language: (createArgs.data.language as string) ?? 'en',
                    source: (createArgs.data.source as string) ?? 'email',
                  };
                  guests.push(guest);
                  return guest;
                },
                findFirst: async (findArgs: { where: { email: string; deletedAt: null } }) => {
                  return guests.find((g) => g.email === findArgs.where.email) ?? null;
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

// ─── Pipeline Integration Tests ─────────────────────────────

/**
 * These integration tests exercise the full email pipeline logic:
 * IMAP fetch -> parse -> dedupe -> classify -> match guest -> thread -> store
 *
 * The IMAP layer is mocked (no real IMAP server) but all other components
 * run with real logic and mocked Prisma for database operations.
 *
 * We re-implement the pipeline orchestration loop from createEmailModule.pollInbox()
 * using the real imported functions, to test the integration between components.
 */

import { parseEmail } from '../email-parser.js';
import { findConversationByHeaders, isForwardedEmail } from '../email-threader.js';
import { classifyEmail } from '../email-classifier.js';
import { matchOrCreateGuest } from '../contact-matcher.js';

/**
 * Simulate the pollInbox pipeline logic with mocked IMAP results.
 * This mirrors the orchestration in createEmailModule.pollInbox() but
 * uses injected raw emails instead of a real IMAP connection.
 */
async function runPipeline(
  prisma: ReturnType<typeof createMockPrisma>,
  rawEmails: { uid: number; source: Buffer }[],
): Promise<{ processed: number; errors: string[] }> {
  let processed = 0;
  const errors: string[] = [];

  for (const raw of rawEmails) {
    try {
      // a. Parse MIME source
      const parsed = await parseEmail(raw.source);

      // b. Deduplicate by Message-ID
      if (parsed.messageId) {
        const existing = await prisma.message.findFirst({
          where: { messageId: parsed.messageId },
          select: { id: true },
        });
        if (existing) {
          continue;
        }
      }

      // c. Classify
      const classification = classifyEmail(parsed.from, parsed.subject);

      // d. Match or create guest
      const guestId = await matchOrCreateGuest(
        prisma as never,
        parsed.from,
        parsed.text,
        classification.category,
      );

      // e. Thread: determine conversation
      let conversationId: string;

      if (isForwardedEmail(parsed.subject)) {
        const conversation = await prisma.conversation.create({
          data: {
            guestId,
            channel: 'email',
            subject: parsed.subject,
            classification: classification.category,
            lastMessageAt: parsed.date,
          },
        });
        conversationId = conversation.id;
      } else {
        const existingConversationId = await findConversationByHeaders(
          prisma as never,
          parsed.inReplyTo,
          parsed.references,
        );

        if (existingConversationId) {
          conversationId = existingConversationId;
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { lastMessageAt: parsed.date },
          });
        } else {
          const conversation = await prisma.conversation.create({
            data: {
              guestId,
              channel: 'email',
              subject: parsed.subject,
              classification: classification.category,
              lastMessageAt: parsed.date,
            },
          });
          conversationId = conversation.id;
        }
      }

      // f. Store message
      await prisma.message.create({
        data: {
          conversationId,
          direction: 'in',
          content: parsed.text,
          channel: 'email',
          messageId: parsed.messageId || null,
          inReplyTo: parsed.inReplyTo ?? null,
          references: parsed.references.join(' ') || null,
          htmlContent: parsed.html || null,
          rawSource: Buffer.from(raw.source),
          fromAddress: parsed.from.address,
          fromName: parsed.from.name,
          subject: parsed.subject,
          classification: classification.category,
          sentAt: parsed.date,
        },
      });

      processed++;
    } catch (err) {
      errors.push(
        `UID ${raw.uid}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { processed, errors };
}

describe('Pipeline Integration Tests', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = createMockPrisma();
    mockedGetSetting.mockRejectedValue(new Error('Not found'));
    mockedWriteAuditLog.mockResolvedValue(undefined);
  });

  // ─── Scenario 1: Single email ingestion ──────────────────

  it('processes a single email and stores message, conversation, and guest', async () => {
    const rawEmails = [
      {
        uid: 1,
        source: buildMimeMessage({
          from: 'anna@example.com',
          fromName: 'Anna Schmidt',
          subject: 'Retreat inquiry',
          messageId: '<msg1@example.com>',
          body: 'Hello, I would like to book a retreat. Can you please send me more information?',
        }),
      },
    ];

    const result = await runPipeline(prisma, rawEmails);

    expect(result.processed).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Verify message stored
    expect(prisma._data.messages).toHaveLength(1);
    const msg = prisma._data.messages[0]!;
    expect(msg.fromAddress).toBe('anna@example.com');
    expect(msg.subject).toBe('Retreat inquiry');
    expect(msg.classification).toBe('guest_inquiry');
    expect(msg.direction).toBe('in');
    expect(msg.channel).toBe('email');

    // Verify conversation created
    expect(prisma._data.conversations).toHaveLength(1);
    const conv = prisma._data.conversations[0]!;
    expect(conv.subject).toBe('Retreat inquiry');
    expect(conv.classification).toBe('guest_inquiry');
    expect(conv.channel).toBe('email');

    // Verify guest created
    expect(prisma._data.guests).toHaveLength(1);
    const guest = prisma._data.guests[0]!;
    expect(guest.name).toBe('Anna Schmidt');
    expect(guest.email).toBe('anna@example.com');
  });

  // ─── Scenario 2: Duplicate email rejection ──────────────

  it('rejects duplicate email (same Message-ID processed twice)', async () => {
    const source = buildMimeMessage({
      from: 'bob@example.com',
      fromName: 'Bob',
      subject: 'Booking question',
      messageId: '<dup1@example.com>',
      body: 'Hello, I would like to book a retreat. Can you please send me more information?',
    });

    // Process first time
    const result1 = await runPipeline(prisma, [{ uid: 1, source }]);
    expect(result1.processed).toBe(1);
    expect(prisma._data.messages).toHaveLength(1);

    // Process same email again
    const result2 = await runPipeline(prisma, [{ uid: 2, source }]);
    expect(result2.processed).toBe(0);

    // Still only one message
    expect(prisma._data.messages).toHaveLength(1);
    expect(result2.errors).toHaveLength(0);
  });

  // ─── Scenario 3: Email threading (reply chain) ──────────

  it('threads reply into same conversation via In-Reply-To', async () => {
    // Original email
    const original = buildMimeMessage({
      from: 'carol@example.com',
      fromName: 'Carol',
      subject: 'Yoga retreat details',
      messageId: '<thread1@example.com>',
      body: 'Hello, I would like to book a retreat. Can you please send me more information?',
    });

    await runPipeline(prisma, [{ uid: 1, source: original }]);
    expect(prisma._data.conversations).toHaveLength(1);
    const convId = prisma._data.conversations[0]!.id;

    // Reply email with In-Reply-To
    const reply = buildMimeMessage({
      from: 'carol@example.com',
      fromName: 'Carol',
      subject: 'Re: Yoga retreat details',
      messageId: '<thread2@example.com>',
      inReplyTo: '<thread1@example.com>',
      references: ['<thread1@example.com>'],
      body: 'Thank you for the information! I would like to proceed with the booking.',
    });

    await runPipeline(prisma, [{ uid: 2, source: reply }]);

    // Both messages should be in the same conversation
    expect(prisma._data.messages).toHaveLength(2);
    expect(prisma._data.messages[0]!.conversationId).toBe(convId);
    expect(prisma._data.messages[1]!.conversationId).toBe(convId);

    // Still only one conversation
    expect(prisma._data.conversations).toHaveLength(1);

    // lastMessageAt was updated
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: convId },
        data: expect.objectContaining({ lastMessageAt: expect.any(Date) }),
      }),
    );
  });

  // ─── Scenario 4: 5-message thread ──────────────────────

  it('threads 5 sequential messages into a single conversation', async () => {
    const messageIds = [
      '<chain1@example.com>',
      '<chain2@example.com>',
      '<chain3@example.com>',
      '<chain4@example.com>',
      '<chain5@example.com>',
    ];

    for (let i = 0; i < 5; i++) {
      const refs = messageIds.slice(0, i);
      const email = buildMimeMessage({
        from: 'dave@example.com',
        fromName: 'Dave',
        subject: i === 0 ? 'Beach walk booking' : 'Re: Beach walk booking',
        messageId: messageIds[i],
        inReplyTo: i > 0 ? messageIds[i - 1] : undefined,
        references: refs.length > 0 ? refs : undefined,
        body: `Hello, I would like to book a retreat. Can you send me info? This is message ${i + 1} in a thread.`,
      });

      await runPipeline(prisma, [{ uid: i + 1, source: email }]);
    }

    // All 5 messages in one conversation
    expect(prisma._data.messages).toHaveLength(5);
    expect(prisma._data.conversations).toHaveLength(1);

    const convId = prisma._data.conversations[0]!.id;
    for (const msg of prisma._data.messages) {
      expect(msg.conversationId).toBe(convId);
    }
  });

  // ─── Scenario 5: OTA email classification ──────────────

  it('classifies OTA email correctly and creates no guest', async () => {
    const otaEmail = buildMimeMessage({
      from: 'noreply@tripaneer.com',
      fromName: 'Tripaneer',
      subject: 'New booking inquiry from Tripaneer',
      messageId: '<ota1@tripaneer.com>',
      body: 'You have a new booking inquiry from Sarah Johnson.',
    });

    const result = await runPipeline(prisma, [{ uid: 1, source: otaEmail }]);

    expect(result.processed).toBe(1);

    // Message stored with ota_notification classification
    expect(prisma._data.messages).toHaveLength(1);
    expect(prisma._data.messages[0]!.classification).toBe('ota_notification');

    // No guest created
    expect(prisma._data.guests).toHaveLength(0);

    // Conversation has null guestId
    expect(prisma._data.conversations).toHaveLength(1);
    expect(prisma._data.conversations[0]!.guestId).toBeNull();
  });

  // ─── Scenario 6: Spam/newsletter classification ────────

  it('classifies spam/newsletter email and creates no guest', async () => {
    const spamEmail = buildMimeMessage({
      from: 'newsletter@marketing.com',
      fromName: 'Marketing Weekly',
      subject: 'Your weekly marketing digest',
      messageId: '<spam1@marketing.com>',
      body: 'Check out our latest marketing offers!',
    });

    const result = await runPipeline(prisma, [{ uid: 1, source: spamEmail }]);

    expect(result.processed).toBe(1);

    // Message stored with spam_newsletter classification
    expect(prisma._data.messages).toHaveLength(1);
    expect(prisma._data.messages[0]!.classification).toBe('spam_newsletter');

    // No guest created
    expect(prisma._data.guests).toHaveLength(0);
  });

  // ─── Scenario 7: Existing guest matching ───────────────

  it('links conversation to existing guest (no new guest created)', async () => {
    // Pre-create a guest in the mock data
    prisma._data.guests.push({
      id: 'existing-guest-1',
      name: 'Returning Guest',
      email: 'returning@guest.com',
      language: 'en',
      source: 'manual',
    });

    const email = buildMimeMessage({
      from: 'returning@guest.com',
      fromName: 'Returning Guest',
      subject: 'I want to come back!',
      messageId: '<return1@guest.com>',
      body: 'Hello, I would like to book another retreat. Can you please send me information?',
    });

    const result = await runPipeline(prisma, [{ uid: 1, source: email }]);

    expect(result.processed).toBe(1);

    // Still only 1 guest (no new guest created)
    expect(prisma._data.guests).toHaveLength(1);

    // Conversation linked to existing guest
    expect(prisma._data.conversations).toHaveLength(1);
    expect(prisma._data.conversations[0]!.guestId).toBe('existing-guest-1');
  });

  // ─── Scenario 8: Forwarded email creates new conversation ─

  it('creates new conversation for forwarded email', async () => {
    // Original email
    const original = buildMimeMessage({
      from: 'eve@example.com',
      fromName: 'Eve',
      subject: 'Original Subject',
      messageId: '<fwd-orig@example.com>',
      body: 'Hello, I would like to book a retreat. Can you please send me more information?',
    });

    await runPipeline(prisma, [{ uid: 1, source: original }]);
    expect(prisma._data.conversations).toHaveLength(1);

    // Forwarded email from same sender
    const forwarded = buildMimeMessage({
      from: 'eve@example.com',
      fromName: 'Eve',
      subject: 'Fwd: Original Subject',
      messageId: '<fwd-new@example.com>',
      body: 'Hello, I would like to forward this message. Please take a look at the information below.',
    });

    await runPipeline(prisma, [{ uid: 2, source: forwarded }]);

    // Two conversations (forwarded email created a new one)
    expect(prisma._data.conversations).toHaveLength(2);

    // Messages are in different conversations
    expect(prisma._data.messages[0]!.conversationId).not.toBe(
      prisma._data.messages[1]!.conversationId,
    );
  });

  // ─── Scenario 9: Missing threading headers ────────────

  it('creates new conversation when no threading headers present', async () => {
    const email1 = buildMimeMessage({
      from: 'frank@example.com',
      fromName: 'Frank',
      subject: 'First email',
      messageId: '<nothread1@example.com>',
      body: 'Hello, I would like to book a retreat. Can you please send me more information about yoga?',
    });

    const email2 = buildMimeMessage({
      from: 'frank@example.com',
      fromName: 'Frank',
      subject: 'Second email',
      messageId: '<nothread2@example.com>',
      // No inReplyTo, no references
      body: 'Hello, I would also like to ask about meditation classes. Can you send me some details?',
    });

    await runPipeline(prisma, [
      { uid: 1, source: email1 },
      { uid: 2, source: email2 },
    ]);

    // Two separate conversations (no subject-based matching)
    expect(prisma._data.conversations).toHaveLength(2);
    expect(prisma._data.messages).toHaveLength(2);
    expect(prisma._data.messages[0]!.conversationId).not.toBe(
      prisma._data.messages[1]!.conversationId,
    );
  });

  // ─── Scenario 10: Pipeline fault tolerance ────────────

  it('continues processing after one email fails to parse', async () => {
    const good1 = buildMimeMessage({
      from: 'good1@example.com',
      fromName: 'Good One',
      subject: 'First good email',
      messageId: '<good1@example.com>',
      body: 'Hello, I would like to book a retreat. Can you please send me more information?',
    });

    // Invalid MIME that will cause parsing issues
    const bad = Buffer.from('This is not a valid MIME message at all \x00\x01\x02');

    const good2 = buildMimeMessage({
      from: 'good2@example.com',
      fromName: 'Good Two',
      subject: 'Second good email',
      messageId: '<good2@example.com>',
      body: 'Hello, I would like to book a retreat too. Can you send me the details please?',
    });

    const result = await runPipeline(prisma, [
      { uid: 1, source: good1 },
      { uid: 2, source: bad },
      { uid: 3, source: good2 },
    ]);

    // The bad email: mailparser is quite resilient and may still parse something.
    // What matters is that all 3 emails are attempted and failures don't block.
    // At minimum, good1 and good2 should succeed.
    expect(result.processed).toBeGreaterThanOrEqual(2);

    // Messages from good emails stored
    const goodMessages = prisma._data.messages.filter(
      (m) => m.fromAddress === 'good1@example.com' || m.fromAddress === 'good2@example.com',
    );
    expect(goodMessages).toHaveLength(2);
  });

  // ─── Scenario: Conversation subject matches email subject ──

  it('stores email subject on both conversation and message', async () => {
    const email = buildMimeMessage({
      from: 'subject-test@example.com',
      fromName: 'Subject Tester',
      subject: 'Puppy yoga class availability',
      messageId: '<subj-test@example.com>',
      body: 'Hello, when is the next puppy yoga class available? I would like to book for 4 people.',
    });

    await runPipeline(prisma, [{ uid: 1, source: email }]);

    expect(prisma._data.conversations[0]!.subject).toBe('Puppy yoga class availability');
    expect(prisma._data.messages[0]!.subject).toBe('Puppy yoga class availability');
  });

  // ─── Scenario: Message-ID stored correctly ────────────

  it('stores Message-ID from email headers on the message record', async () => {
    const email = buildMimeMessage({
      from: 'msgid-test@example.com',
      fromName: 'MsgID Tester',
      subject: 'Test message ID storage',
      messageId: '<unique-id-12345@example.com>',
      body: 'Hello, I would like to book a retreat. Can you please send me more information?',
    });

    await runPipeline(prisma, [{ uid: 1, source: email }]);

    expect(prisma._data.messages[0]!.messageId).toBe('<unique-id-12345@example.com>');
  });
});
