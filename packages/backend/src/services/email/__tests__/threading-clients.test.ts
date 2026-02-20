import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findConversationByHeaders,
  buildReferencesChain,
  isForwardedEmail,
} from '../email-threader.js';

// ─── Mock PrismaClient ──────────────────────────────────────

interface StoredMessage {
  id: string;
  messageId: string;
  conversationId: string;
}

function createMockPrisma(storedMessages: StoredMessage[] = []) {
  return {
    message: {
      findFirst: vi.fn(async (args: { where: { messageId: string }; select?: Record<string, boolean> }) => {
        const found = storedMessages.find((m) => m.messageId === args.where.messageId);
        if (!found) return null;
        if (args.select?.conversationId) return { conversationId: found.conversationId };
        return found;
      }),
    },
  };
}

// ─── Gmail Threading ────────────────────────────────────────

describe('Gmail threading', () => {
  it('threads a 3-message Gmail conversation', async () => {
    // Gmail always sets both In-Reply-To and full References chain.
    // Message-IDs use format: <hash@mail.gmail.com>

    // Message 1: Original from guest (Gmail)
    const msg1Id = '<CAGxyz123abc@mail.gmail.com>';
    const conv1 = 'conv-gmail-001';

    // Message 2: Reply from Ines (our SMTP)
    const msg2Id = '<reply-001@puppyyogaretreat.gmx.de>';

    // Message 3: Reply from guest (Gmail), full References chain
    const msg3Id = '<CAGxyz456def@mail.gmail.com>';

    // DB has messages 1 and 2 stored
    const storedMessages: StoredMessage[] = [
      { id: 'db-msg-1', messageId: msg1Id, conversationId: conv1 },
      { id: 'db-msg-2', messageId: msg2Id, conversationId: conv1 },
    ];

    const prisma = createMockPrisma(storedMessages);

    // Message 3 arrives: Gmail sets In-Reply-To to msg2, References to full chain
    const result = await findConversationByHeaders(
      prisma as never,
      msg2Id, // In-Reply-To: the message being replied to
      [msg1Id, msg2Id], // References: full chain from oldest to newest
    );

    expect(result).toBe(conv1);
  });

  it('Gmail: In-Reply-To takes priority over References for matching', async () => {
    const msg1Id = '<CAG-first@mail.gmail.com>';
    const msg2Id = '<CAG-second@mail.gmail.com>';
    const conv1 = 'conv-gmail-priority';

    const storedMessages: StoredMessage[] = [
      { id: 'db-msg-1', messageId: msg1Id, conversationId: conv1 },
      { id: 'db-msg-2', messageId: msg2Id, conversationId: conv1 },
    ];

    const prisma = createMockPrisma(storedMessages);

    // In-Reply-To matches msg2 directly
    const result = await findConversationByHeaders(
      prisma as never,
      msg2Id,
      [msg1Id, msg2Id],
    );

    expect(result).toBe(conv1);
    // Should have found match on first call (In-Reply-To), not needing References
    expect(prisma.message.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: { messageId: msg2Id },
      select: { conversationId: true },
    });
  });
});

// ─── Outlook Threading ──────────────────────────────────────

describe('Outlook threading', () => {
  it('threads a 3-message Outlook conversation with short References', async () => {
    // Outlook may only include root + parent in References (not full chain).
    // Message-IDs use format: <MSGID.outlook.com>

    const msg1Id = '<MSG001.prod.outlook.com>';
    const msg2Id = '<MSG002.prod.outlook.com>';
    const conv1 = 'conv-outlook-001';

    const storedMessages: StoredMessage[] = [
      { id: 'db-msg-1', messageId: msg1Id, conversationId: conv1 },
      { id: 'db-msg-2', messageId: msg2Id, conversationId: conv1 },
    ];

    const prisma = createMockPrisma(storedMessages);

    // Message 3: Outlook sets In-Reply-To to msg2, References to root + parent only
    const msg3Id = '<MSG003.prod.outlook.com>';
    const result = await findConversationByHeaders(
      prisma as never,
      msg2Id, // In-Reply-To: parent
      [msg1Id, msg2Id], // References: root + parent (Outlook shortens this)
    );

    expect(result).toBe(conv1);
  });

  it('Outlook: falls back to References when In-Reply-To has no DB match', async () => {
    // In cases where our DB only has the root message (msg1) but not msg2,
    // Outlook's short References should still find the thread via root.

    const msg1Id = '<MSG-root.outlook.com>';
    const msg2Id = '<MSG-parent.outlook.com>'; // Not in our DB
    const conv1 = 'conv-outlook-fallback';

    const storedMessages: StoredMessage[] = [
      { id: 'db-msg-1', messageId: msg1Id, conversationId: conv1 },
      // msg2 NOT in DB (e.g., sent externally)
    ];

    const prisma = createMockPrisma(storedMessages);

    // Message 3: In-Reply-To is msg2 (not found), References has [root, parent]
    const result = await findConversationByHeaders(
      prisma as never,
      msg2Id, // In-Reply-To: no match
      [msg1Id, msg2Id], // References: root found
    );

    expect(result).toBe(conv1);

    // Should have checked: In-Reply-To (miss), then References newest-first: msg2 (miss), msg1 (hit)
    expect(prisma.message.findFirst).toHaveBeenCalledTimes(3);
  });
});

// ─── Apple Mail Threading ───────────────────────────────────

describe('Apple Mail threading', () => {
  it('threads with UUID-style Message-IDs from Apple Mail', async () => {
    // Apple Mail uses UUID-format Message-IDs: <UUID@icloud.com>

    const msg1Id = '<A1B2C3D4-E5F6-7890-ABCD-EF1234567890@icloud.com>';
    const msg2Id = '<F0E1D2C3-B4A5-6789-0123-456789ABCDEF@icloud.com>';
    const conv1 = 'conv-apple-001';

    const storedMessages: StoredMessage[] = [
      { id: 'db-msg-1', messageId: msg1Id, conversationId: conv1 },
      { id: 'db-msg-2', messageId: msg2Id, conversationId: conv1 },
    ];

    const prisma = createMockPrisma(storedMessages);

    // Message 3 from Apple Mail: full References chain
    const msg3Id = '<12345678-ABCD-EF01-2345-6789ABCDEF01@icloud.com>';
    const result = await findConversationByHeaders(
      prisma as never,
      msg2Id,
      [msg1Id, msg2Id],
    );

    expect(result).toBe(conv1);
  });

  it('Apple Mail: threads correctly despite long UUID Message-IDs', async () => {
    // Ensure the long UUID format doesn't cause matching issues
    const msg1Id = '<AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE@mac.com>';
    const conv1 = 'conv-apple-uuid';

    const storedMessages: StoredMessage[] = [
      { id: 'db-msg-1', messageId: msg1Id, conversationId: conv1 },
    ];

    const prisma = createMockPrisma(storedMessages);

    const result = await findConversationByHeaders(
      prisma as never,
      msg1Id,
      [msg1Id],
    );

    expect(result).toBe(conv1);
  });
});

// ─── Webmail (no headers) ───────────────────────────────────

describe('Webmail (no threading headers)', () => {
  it('creates new conversation when webmail sends no In-Reply-To or References', async () => {
    const storedMessages: StoredMessage[] = [
      { id: 'db-msg-1', messageId: '<existing@example.com>', conversationId: 'conv-existing' },
    ];

    const prisma = createMockPrisma(storedMessages);

    // Webmail reply with no threading headers
    const result = await findConversationByHeaders(
      prisma as never,
      undefined, // No In-Reply-To
      [], // No References
    );

    expect(result).toBeNull();
    // No DB queries should have been made
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  it('no subject-based fallback: same subject but no headers = new conversation', async () => {
    // Even if subject matches, without threading headers we create new conversation
    const storedMessages: StoredMessage[] = [
      { id: 'db-msg-1', messageId: '<subj-match@example.com>', conversationId: 'conv-subj' },
    ];

    const prisma = createMockPrisma(storedMessages);

    const result = await findConversationByHeaders(
      prisma as never,
      undefined,
      [],
    );

    expect(result).toBeNull();
  });
});

// ─── Cross-client Threading ─────────────────────────────────

describe('Cross-client threading', () => {
  it('maintains thread across Gmail -> our SMTP -> Gmail', async () => {
    // Simulates a real conversation flow:
    // 1. Guest sends from Gmail
    // 2. Ines replies (our SMTP generates a Message-ID)
    // 3. Guest replies from Gmail (references both messages)

    const guestMsg1Id = '<CAGuestOriginal@mail.gmail.com>';
    const inesReplyId = '<reply-from-system-001@gmx.de>';
    const guestMsg2Id = '<CAGuestFollowup@mail.gmail.com>';
    const convId = 'conv-cross-001';

    const storedMessages: StoredMessage[] = [
      { id: 'db-1', messageId: guestMsg1Id, conversationId: convId },
      { id: 'db-2', messageId: inesReplyId, conversationId: convId },
    ];

    const prisma = createMockPrisma(storedMessages);

    // Guest's second Gmail reply references the full chain
    const result = await findConversationByHeaders(
      prisma as never,
      inesReplyId, // In-Reply-To: Ines's reply
      [guestMsg1Id, inesReplyId], // References: full chain
    );

    expect(result).toBe(convId);
  });

  it('maintains thread across Outlook -> our SMTP -> Outlook', async () => {
    const guestMsg1Id = '<MSG-outlook-1.prod.outlook.com>';
    const inesReplyId = '<system-reply-002@gmx.de>';
    const convId = 'conv-cross-outlook';

    const storedMessages: StoredMessage[] = [
      { id: 'db-1', messageId: guestMsg1Id, conversationId: convId },
      { id: 'db-2', messageId: inesReplyId, conversationId: convId },
    ];

    const prisma = createMockPrisma(storedMessages);

    // Outlook may only include root + parent in References
    const result = await findConversationByHeaders(
      prisma as never,
      inesReplyId,
      [guestMsg1Id, inesReplyId],
    );

    expect(result).toBe(convId);
  });

  it('maintains thread across Apple Mail -> our SMTP -> Apple Mail', async () => {
    const guestMsg1Id = '<AABBCCDD-1111-2222-3333-444455556666@icloud.com>';
    const inesReplyId = '<system-reply-003@gmx.de>';
    const convId = 'conv-cross-apple';

    const storedMessages: StoredMessage[] = [
      { id: 'db-1', messageId: guestMsg1Id, conversationId: convId },
      { id: 'db-2', messageId: inesReplyId, conversationId: convId },
    ];

    const prisma = createMockPrisma(storedMessages);

    // Apple Mail reply with full chain
    const guestMsg2Id = '<EEFF0011-5555-6666-7777-888899990000@icloud.com>';
    const result = await findConversationByHeaders(
      prisma as never,
      inesReplyId,
      [guestMsg1Id, inesReplyId],
    );

    expect(result).toBe(convId);
  });
});

// ─── Outbound References Header ─────────────────────────────

describe('Outbound References header', () => {
  it('builds correct References for reply to Gmail thread', () => {
    // When replying to a Gmail thread, we should append our Message-ID
    const existingRefs = [
      '<CAGmsg1@mail.gmail.com>',
      '<CAGmsg2@mail.gmail.com>',
    ];
    const ourReplyId = '<reply-001@gmx.de>';

    const result = buildReferencesChain(existingRefs, ourReplyId);

    expect(result).toEqual([
      '<CAGmsg1@mail.gmail.com>',
      '<CAGmsg2@mail.gmail.com>',
      '<reply-001@gmx.de>',
    ]);
  });

  it('builds correct References for reply to Outlook thread with short chain', () => {
    // Outlook may provide only root + parent
    const existingRefs = [
      '<MSG-root.outlook.com>',
      '<MSG-parent.outlook.com>',
    ];
    const ourReplyId = '<reply-outlook-001@gmx.de>';

    const result = buildReferencesChain(existingRefs, ourReplyId);

    expect(result).toEqual([
      '<MSG-root.outlook.com>',
      '<MSG-parent.outlook.com>',
      '<reply-outlook-001@gmx.de>',
    ]);
  });

  it('caps References at 20 entries', () => {
    const chain = Array.from({ length: 25 }, (_, i) => `<msg${i}@example.com>`);
    const result = buildReferencesChain(chain, '<msg25@example.com>');

    expect(result).toHaveLength(20);
    // Oldest entries dropped, newest (including the new one) kept
    expect(result[result.length - 1]).toBe('<msg25@example.com>');
    // First entry should be msg7 (dropped msg0 through msg6)
    expect(result[0]).toBe('<msg6@example.com>');
  });

  it('caps References at exactly 20 when existing chain is exactly 20', () => {
    const chain = Array.from({ length: 20 }, (_, i) => `<msg${i}@example.com>`);
    const result = buildReferencesChain(chain, '<msg20@example.com>');

    expect(result).toHaveLength(20);
    expect(result[0]).toBe('<msg1@example.com>'); // msg0 dropped
    expect(result[result.length - 1]).toBe('<msg20@example.com>');
  });

  it('deduplicates when reply ID already in chain', () => {
    const existingRefs = [
      '<a@example.com>',
      '<b@example.com>',
    ];
    // Edge case: our reply ID somehow already in chain
    const result = buildReferencesChain(existingRefs, '<a@example.com>');

    expect(result).toEqual(['<a@example.com>', '<b@example.com>']);
  });

  it('handles empty existing chain (first reply in thread)', () => {
    const result = buildReferencesChain([], '<first-reply@gmx.de>');

    expect(result).toEqual(['<first-reply@gmx.de>']);
  });
});

// ─── Forwarded Email Detection ──────────────────────────────

describe('Forwarded email detection across clients', () => {
  it('detects Gmail "Fwd:" prefix', () => {
    expect(isForwardedEmail('Fwd: Retreat booking details')).toBe(true);
  });

  it('detects Outlook "FW:" prefix', () => {
    expect(isForwardedEmail('FW: Retreat booking details')).toBe(true);
    expect(isForwardedEmail('Fw: Retreat booking details')).toBe(true);
  });

  it('detects Apple Mail "Fwd:" prefix', () => {
    expect(isForwardedEmail('Fwd: Retreat booking details')).toBe(true);
  });

  it('does not match "Re: Fwd:" as a forward (it is a reply to a forward)', () => {
    // "Re: Fwd:" starts with "Re:", not "Fwd:"
    expect(isForwardedEmail('Re: Fwd: Original Subject')).toBe(false);
  });

  it('handles leading whitespace before Fwd:', () => {
    expect(isForwardedEmail('  Fwd: Retreat booking')).toBe(true);
  });
});
