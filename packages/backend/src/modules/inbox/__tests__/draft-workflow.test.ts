/**
 * Tests for draft approve/reject/regenerate workflows in conversation.service.ts.
 *
 * Verifies:
 * - Approve sends email via SMTP, stores outbound message, updates draft status
 * - Edited approve uses modified content
 * - Reject updates status to 'rejected'
 * - Regenerate rejects old draft and enqueues new AI draft job
 * - Error cases (not found, wrong status) throw correct exceptions
 *
 * All tests use mocked Prisma, mocked email module, and mocked BullMQ queue.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Mock modules (must be before imports) ----------------------------

vi.mock('../../../lib/audit.js', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getActor: vi.fn((id?: string) => id ?? 'system'),
}));

const mockSendEmail = vi.fn().mockResolvedValue({ messageId: '<sent-msg-id@example.com>' });

vi.mock('../../../services/email/index.js', () => ({
  createEmailModule: vi.fn().mockImplementation(() => ({
    sendEmail: mockSendEmail,
  })),
}));

vi.mock('../../../services/email/email-threader.js', () => ({
  buildReferencesChain: vi.fn().mockImplementation(() => ['<ref-1@example.com>', '<ref-2@example.com>']),
}));

// ---- Imports (after mocks) -------------------------------------------

import { approveDraft, rejectDraft, regenerateDraft, generateDraftForConversation } from '../conversation.service.js';

// ---- Factories -------------------------------------------------------

function makeDraft(overrides?: Partial<{
  id: string;
  conversationId: string;
  messageId: string | null;
  content: string;
  status: string;
}>) {
  return {
    id: overrides?.id ?? 'draft-1',
    conversationId: overrides?.conversationId ?? 'conv-1',
    messageId: overrides?.messageId ?? 'msg-1',
    content: overrides?.content ?? 'Thank you for your inquiry! We have availability in April.',
    status: overrides?.status ?? 'pending',
    model: 'anthropic/claude-sonnet-4-5-20250929',
    tokensUsed: 2500,
    inputTokens: 2000,
    outputTokens: 500,
    costEur: 250,
    provider: 'anthropic',
    durationMs: 1200,
    flags: [],
    createdAt: new Date('2026-03-15T12:00:00Z'),
    updatedAt: new Date('2026-03-15T12:00:00Z'),
  };
}

function makeConversation(overrides?: Partial<{
  guestEmail: string | null;
  guestLanguage: string;
}>) {
  return {
    id: 'conv-1',
    subject: 'Retreat inquiry',
    guestId: 'guest-1',
    channel: 'email',
    status: 'open',
    guest: overrides?.guestEmail === null
      ? null
      : {
          id: 'guest-1',
          name: 'Maria Schmidt',
          email: overrides?.guestEmail ?? 'maria@example.com',
          language: overrides?.guestLanguage ?? 'en',
        },
    messages: [
      { messageId: '<inbound-1@example.com>', direction: 'in' },
      { messageId: '<outbound-1@example.com>', direction: 'out' },
    ],
  };
}

function makeMockPrisma(opts?: {
  draft?: ReturnType<typeof makeDraft> | null;
  conversation?: ReturnType<typeof makeConversation> | null;
  latestMessage?: { id: string; direction: 'in' | 'out' } | null;
}) {
  const draft = opts && 'draft' in opts ? opts.draft : makeDraft();
  const conversation = opts && 'conversation' in opts ? opts.conversation : makeConversation();
  const latestMessage = opts && 'latestMessage' in opts
    ? opts.latestMessage
    : { id: 'msg-1', direction: 'in' as const };

  const txMock = {
    aiDraft: {
      update: vi.fn().mockResolvedValue({ ...draft, status: 'approved' }),
    },
    message: {
      create: vi.fn().mockResolvedValue({ id: 'msg-out-1' }),
    },
    conversation: {
      update: vi.fn().mockResolvedValue(conversation),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  };

  return {
    aiDraft: {
      findFirst: vi.fn().mockResolvedValue(draft),
      findUnique: vi.fn().mockResolvedValue(draft),
      findMany: vi.fn().mockResolvedValue(draft ? [draft] : []),
      update: vi.fn().mockResolvedValue({ ...draft, status: 'rejected' }),
    },
    conversation: {
      findUnique: vi.fn().mockResolvedValue(conversation),
    },
    message: {
      findFirst: vi.fn().mockResolvedValue(latestMessage),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(txMock);
    }),
    _tx: txMock, // exposed for assertions
  };
}

function makeMockApp(opts?: {
  addFn?: ReturnType<typeof vi.fn>;
}) {
  const addFn = opts?.addFn ?? vi.fn().mockResolvedValue({ id: 'job-1' });
  return {
    queues: {
      getQueue: vi.fn().mockReturnValue({ add: addFn }),
    },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    },
  };
}

// ---- Tests -----------------------------------------------------------

describe('draft workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Note: do NOT use vi.restoreAllMocks() here -- it would reset vi.mock factory implementations
    // vi.clearAllMocks() in beforeEach is sufficient to clear call history between tests
  });

  // ---- approveDraft ---------------------------------------------------

  describe('approveDraft', () => {
    it('approves draft and sends email via SMTP', async () => {
      const prisma = makeMockPrisma();
      const app = makeMockApp();

      const result = await approveDraft(
        prisma as never,
        app as never,
        'conv-1',
        'draft-1',
        undefined, // no edited content
        'user-1',
      );

      // Email sent
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'maria@example.com',
          subject: 'Retreat inquiry',
        }),
      );

      // Returns messageId and sentAt
      expect(result.messageId).toBe('<sent-msg-id@example.com>');
      expect(result.sentAt).toBeInstanceOf(Date);

      // Draft status updated to 'approved'
      expect(prisma._tx.aiDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'draft-1' },
          data: expect.objectContaining({ status: 'approved' }),
        }),
      );

      // Outbound message created
      expect(prisma._tx.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId: 'conv-1',
            direction: 'out',
            channel: 'email',
          }),
        }),
      );
    });

    it('approves edited draft with modified content', async () => {
      const prisma = makeMockPrisma();
      const app = makeMockApp();

      const result = await approveDraft(
        prisma as never,
        app as never,
        'conv-1',
        'draft-1',
        'Modified reply: We look forward to seeing you!',
        'user-1',
      );

      expect(result.messageId).toBe('<sent-msg-id@example.com>');

      // Draft status should be 'edited' (not 'approved')
      expect(prisma._tx.aiDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'edited',
            content: 'Modified reply: We look forward to seeing you!',
          }),
        }),
      );

      // SMTP called with the edited content
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Modified reply: We look forward to seeing you!',
        }),
      );
    });

    it('strips markdown from approved content before SMTP send', async () => {
      const prisma = makeMockPrisma({
        draft: makeDraft({
          content: 'Hi **Maria**,\n\n- We have availability.\n[Book now](https://example.com)',
        }),
      });
      const app = makeMockApp();

      await approveDraft(
        prisma as never,
        app as never,
        'conv-1',
        'draft-1',
        undefined,
        'user-1',
      );

      const sentBody = mockSendEmail.mock.calls[0]?.[0]?.body as string;
      expect(sentBody).toContain('Hi Maria');
      expect(sentBody).toContain('We have availability.');
      expect(sentBody).toContain('Book now');
      expect(sentBody).not.toContain('**');
      expect(sentBody).not.toContain('[Book now]');
      expect(sentBody).not.toContain('https://example.com');

      expect(prisma._tx.aiDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            content: sentBody,
          }),
        }),
      );
    });

    it('rejects approve for non-pending draft', async () => {
      const prisma = makeMockPrisma({
        draft: makeDraft({ status: 'approved' }),
      });
      const app = makeMockApp();

      await expect(
        approveDraft(prisma as never, app as never, 'conv-1', 'draft-1'),
      ).rejects.toThrow(/Cannot approve draft with status 'approved'/);
    });

    it('rejects approve for non-existent draft', async () => {
      const prisma = makeMockPrisma({ draft: null });
      const app = makeMockApp();

      await expect(
        approveDraft(prisma as never, app as never, 'conv-1', 'draft-999'),
      ).rejects.toThrow(/not found/i);
    });
  });

  // ---- rejectDraft ----------------------------------------------------

  describe('rejectDraft', () => {
    it('rejects pending draft', async () => {
      const prisma = makeMockPrisma();

      const result = await rejectDraft(
        prisma as never,
        'conv-1',
        'draft-1',
        'user-1',
      );

      // $transaction called for reject + audit
      expect(prisma.$transaction).toHaveBeenCalled();

      // Draft updated to 'rejected' status
      expect(prisma._tx.aiDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'draft-1' },
          data: { status: 'rejected' },
        }),
      );

      // Returns the updated draft
      expect(result).toBeDefined();
    });

    it('throws for non-pending draft rejection', async () => {
      const prisma = makeMockPrisma({
        draft: makeDraft({ status: 'approved' }),
      });

      await expect(
        rejectDraft(prisma as never, 'conv-1', 'draft-1'),
      ).rejects.toThrow(/Cannot reject draft with status 'approved'/);
    });
  });

  // ---- regenerateDraft ------------------------------------------------

  describe('regenerateDraft', () => {
    it('rejects old draft and enqueues new AI draft job', async () => {
      const addFn = vi.fn().mockResolvedValue({ id: 'job-1' });
      const prisma = makeMockPrisma();
      const app = makeMockApp({ addFn });

      const result = await regenerateDraft(
        prisma as never,
        app as never,
        'conv-1',
        'draft-1',
        'user-1',
      );

      expect(result).toEqual({ queued: true });

      // Old draft rejected via transaction
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma._tx.aiDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'draft-1' },
          data: { status: 'rejected' },
        }),
      );

      // New job enqueued
      expect(addFn).toHaveBeenCalledWith('ai-draft', expect.objectContaining({
        conversationId: 'conv-1',
        messageId: 'msg-1',
      }));
    });

    it('reads guest language from profile for regeneration', async () => {
      const addFn = vi.fn().mockResolvedValue({ id: 'job-1' });
      const prisma = makeMockPrisma({
        conversation: makeConversation({ guestLanguage: 'de' }),
      });
      const app = makeMockApp({ addFn });

      await regenerateDraft(
        prisma as never,
        app as never,
        'conv-1',
        'draft-1',
        'user-1',
      );

      expect(addFn).toHaveBeenCalledWith('ai-draft', expect.objectContaining({
        guestLanguage: 'de',
      }));
    });
  });

  // ---- generateDraftForConversation -----------------------------------

  describe('generateDraftForConversation', () => {
    it('enqueues draft generation for latest inbound message', async () => {
      const addFn = vi.fn().mockResolvedValue({ id: 'job-42' });
      const prisma = makeMockPrisma({
        latestMessage: { id: 'msg-99', direction: 'in' },
      });
      const app = makeMockApp({ addFn });

      const result = await generateDraftForConversation(
        prisma as never,
        app as never,
        'conv-1',
        'user-1',
      );

      expect(addFn).toHaveBeenCalledWith('ai-draft', expect.objectContaining({
        conversationId: 'conv-1',
        messageId: 'msg-99',
      }));
      expect(result).toEqual({ jobId: 'job-42', messageId: 'msg-99' });
    });

    it('rejects generation when latest message is outbound', async () => {
      const prisma = makeMockPrisma({
        latestMessage: { id: 'msg-out', direction: 'out' },
      });
      const app = makeMockApp();

      await expect(
        generateDraftForConversation(prisma as never, app as never, 'conv-1', 'user-1'),
      ).rejects.toThrow(/Latest message is outbound/);
    });
  });
});
