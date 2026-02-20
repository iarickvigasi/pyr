import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findConversationByHeaders,
  buildReferencesChain,
  isForwardedEmail,
} from '../email-threader.js';

// ─── Mock PrismaClient ──────────────────────────────────────

function createMockPrisma() {
  return {
    message: {
      findFirst: vi.fn(),
    },
  };
}

// ─── findConversationByHeaders ──────────────────────────────

describe('findConversationByHeaders', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('returns conversationId when inReplyTo matches an existing message', async () => {
    prisma.message.findFirst.mockResolvedValueOnce({
      conversationId: 'conv-001',
    });

    const result = await findConversationByHeaders(
      prisma as never,
      '<orig@example.com>',
      [],
    );

    expect(result).toBe('conv-001');
    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: { messageId: '<orig@example.com>' },
      select: { conversationId: true },
    });
  });

  it('falls back to References when inReplyTo has no match', async () => {
    // inReplyTo lookup returns null
    prisma.message.findFirst.mockResolvedValueOnce(null);
    // First references entry (checked in reverse: <ref-c> is newest)
    prisma.message.findFirst.mockResolvedValueOnce(null);
    // Second references entry (<ref-b>)
    prisma.message.findFirst.mockResolvedValueOnce({
      conversationId: 'conv-002',
    });

    const result = await findConversationByHeaders(
      prisma as never,
      '<nomatch@example.com>',
      ['<ref-a@example.com>', '<ref-b@example.com>', '<ref-c@example.com>'],
    );

    expect(result).toBe('conv-002');
  });

  it('checks References in reverse order (newest first)', async () => {
    // inReplyTo lookup returns null
    prisma.message.findFirst.mockResolvedValueOnce(null);
    // First check: newest reference (<ref-c>)
    prisma.message.findFirst.mockResolvedValueOnce({
      conversationId: 'conv-newest',
    });

    const result = await findConversationByHeaders(
      prisma as never,
      '<nomatch@example.com>',
      ['<ref-a@example.com>', '<ref-b@example.com>', '<ref-c@example.com>'],
    );

    expect(result).toBe('conv-newest');
    // The second call (first reference check) should be the last element
    expect(prisma.message.findFirst).toHaveBeenNthCalledWith(2, {
      where: { messageId: '<ref-c@example.com>' },
      select: { conversationId: true },
    });
  });

  it('returns null when neither inReplyTo nor references match', async () => {
    prisma.message.findFirst.mockResolvedValue(null);

    const result = await findConversationByHeaders(
      prisma as never,
      '<nomatch@example.com>',
      ['<noref1@example.com>', '<noref2@example.com>'],
    );

    expect(result).toBeNull();
  });

  it('returns null when both inReplyTo and references are empty/undefined', async () => {
    const result = await findConversationByHeaders(
      prisma as never,
      undefined,
      [],
    );

    expect(result).toBeNull();
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  it('uses references when inReplyTo is undefined but references has matches', async () => {
    // First reference check (newest: <ref-b>)
    prisma.message.findFirst.mockResolvedValueOnce({
      conversationId: 'conv-ref-only',
    });

    const result = await findConversationByHeaders(
      prisma as never,
      undefined,
      ['<ref-a@example.com>', '<ref-b@example.com>'],
    );

    expect(result).toBe('conv-ref-only');
  });
});

// ─── buildReferencesChain ───────────────────────────────────

describe('buildReferencesChain', () => {
  it('appends newMessageId to existing references chain', () => {
    const result = buildReferencesChain(
      ['<a@ex.com>', '<b@ex.com>'],
      '<c@ex.com>',
    );

    expect(result).toEqual(['<a@ex.com>', '<b@ex.com>', '<c@ex.com>']);
  });

  it('caps at 20 Message-IDs, dropping oldest when exceeded', () => {
    const existing = Array.from({ length: 20 }, (_, i) => `<msg${i}@ex.com>`);
    const result = buildReferencesChain(existing, '<msg20@ex.com>');

    expect(result).toHaveLength(20);
    // Oldest (msg0) should be dropped
    expect(result[0]).toBe('<msg1@ex.com>');
    // Newest should be last
    expect(result[result.length - 1]).toBe('<msg20@ex.com>');
  });

  it('returns single-element array for empty existing + new messageId', () => {
    const result = buildReferencesChain([], '<new@ex.com>');

    expect(result).toEqual(['<new@ex.com>']);
  });

  it('deduplicates Message-IDs in the chain', () => {
    const result = buildReferencesChain(
      ['<a@ex.com>', '<b@ex.com>', '<a@ex.com>'],
      '<b@ex.com>',
    );

    expect(result).toEqual(['<a@ex.com>', '<b@ex.com>']);
  });
});

// ─── isForwardedEmail ───────────────────────────────────────

describe('isForwardedEmail', () => {
  it('detects "Fwd:" prefix (case-insensitive)', () => {
    expect(isForwardedEmail('Fwd: Original Subject')).toBe(true);
    expect(isForwardedEmail('fwd: lowercase forward')).toBe(true);
    expect(isForwardedEmail('FWD: UPPERCASE FORWARD')).toBe(true);
  });

  it('detects "Fw:" prefix (case-insensitive)', () => {
    expect(isForwardedEmail('Fw: Forwarded')).toBe(true);
    expect(isForwardedEmail('fw: lowercase')).toBe(true);
  });

  it('returns false for non-forwarded subjects', () => {
    expect(isForwardedEmail('Re: Reply')).toBe(false);
    expect(isForwardedEmail('Hello World')).toBe(false);
    expect(isForwardedEmail('Not a forward Fwd: embedded')).toBe(false);
    expect(isForwardedEmail('')).toBe(false);
  });
});
