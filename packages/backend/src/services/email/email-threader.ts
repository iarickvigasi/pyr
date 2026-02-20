import type { PrismaClient } from '@prisma/client';

// ─── Constants ──────────────────────────────────────────────

const MAX_REFERENCES_CHAIN = 20;

// ─── Public API ─────────────────────────────────────────────

/**
 * Find an existing conversation by email threading headers.
 *
 * Strategy:
 * 1. Try matching In-Reply-To header against existing message messageId fields
 * 2. If no match, iterate References in reverse order (newest first)
 * 3. If no match found, return null (caller should create a new conversation)
 *
 * @param prisma    PrismaClient instance
 * @param inReplyTo The In-Reply-To header value (single Message-ID)
 * @param references The References header values (array of Message-IDs)
 * @returns conversationId if found, null otherwise
 */
export async function findConversationByHeaders(
  prisma: PrismaClient,
  inReplyTo: string | undefined,
  references: string[],
): Promise<string | null> {
  // Fast path: no threading headers at all
  if (!inReplyTo && references.length === 0) {
    return null;
  }

  // 1. Try In-Reply-To first (most reliable threading header)
  if (inReplyTo) {
    const match = await prisma.message.findFirst({
      where: { messageId: inReplyTo },
      select: { conversationId: true },
    });
    if (match) {
      return match.conversationId;
    }
  }

  // 2. Fall back to References, checking newest first (reverse order)
  for (let i = references.length - 1; i >= 0; i--) {
    const ref = references[i];
    const match = await prisma.message.findFirst({
      where: { messageId: ref },
      select: { conversationId: true },
    });
    if (match) {
      return match.conversationId;
    }
  }

  // 3. No match found — this is a new conversation
  return null;
}

/**
 * Build a References header chain for an outbound reply.
 *
 * Appends the new message ID to the existing chain, deduplicates,
 * and caps at 20 entries (dropping oldest) to prevent unbounded growth.
 *
 * @param existingRefs The current References chain from the conversation
 * @param newMessageId The Message-ID of the new message being sent
 * @returns Updated references chain
 */
export function buildReferencesChain(
  existingRefs: string[],
  newMessageId: string,
): string[] {
  // Append new message ID
  const combined = [...existingRefs, newMessageId];

  // Deduplicate while preserving order
  const deduped = [...new Set(combined)];

  // Cap at MAX_REFERENCES_CHAIN, dropping oldest (front) entries
  if (deduped.length > MAX_REFERENCES_CHAIN) {
    return deduped.slice(deduped.length - MAX_REFERENCES_CHAIN);
  }

  return deduped;
}

/**
 * Check if an email subject indicates a forwarded message.
 *
 * Forwarded emails should always create a new conversation rather than
 * being threaded into an existing one — the original conversation context
 * no longer applies.
 *
 * @param subject The email subject line
 * @returns true if the subject starts with "Fwd:" or "Fw:" (case-insensitive)
 */
export function isForwardedEmail(subject: string): boolean {
  const lower = subject.toLowerCase().trimStart();
  return lower.startsWith('fwd:') || lower.startsWith('fw:');
}
