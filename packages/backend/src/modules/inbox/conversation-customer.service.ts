import type { PrismaClient } from '@prisma/client';
import { notDeleted } from '../../lib/prisma-helpers.js';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { parseOtaEmail } from '../../services/email/ota-parsers/index.js';
import { detectLanguage } from '../../services/email/language-detector.js';
import {
  normalizePrimaryClassification,
  isOtaClassification,
} from '../../services/email/inbox-classification.js';
import type { Conversation } from '../../types/entities.js';

export type CustomerSuggestionStatus =
  | 'linked'
  | 'matched_existing'
  | 'needs_create'
  | 'insufficient_data'
  | 'not_applicable';

export interface ConversationCustomerSuggestion {
  status: CustomerSuggestionStatus;
  classification: string | null;
  reason: string;
  matchedGuest?: { id: string; name: string; email: string | null } | null;
  candidate?: {
    name: string | null;
    email: string | null;
    phone: string | null;
    shouldCreate: boolean;
  } | null;
}

function guessNameFromEmail(email: string | null): string | null {
  if (!email) return null;
  const local = email.split('@')[0]?.trim();
  return local ? local : null;
}

export async function getConversationCustomerSuggestion(
  prisma: PrismaClient,
  conversationId: string,
): Promise<ConversationCustomerSuggestion> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      guest: { select: { id: true, name: true, email: true } },
      messages: {
        orderBy: { sentAt: 'desc' },
        take: 8,
        select: {
          direction: true,
          fromAddress: true,
          fromName: true,
          subject: true,
          htmlContent: true,
          content: true,
        },
      },
    },
  });

  if (!conversation) {
    throw new NotFoundError('Conversation', conversationId);
  }

  if (conversation.guest) {
    return {
      status: 'linked',
      classification: conversation.classification,
      reason: 'Conversation is already linked to a guest',
      matchedGuest: conversation.guest,
      candidate: null,
    };
  }

  const primary = normalizePrimaryClassification(conversation.classification);
  if (primary === 'other') {
    return {
      status: 'not_applicable',
      classification: conversation.classification,
      reason: 'Conversation classification is non-actionable',
      candidate: null,
    };
  }

  const latestInbound = conversation.messages.find((m) => m.direction === 'in');
  if (!latestInbound) {
    return {
      status: 'insufficient_data',
      classification: conversation.classification,
      reason: 'No inbound message available to infer customer data',
      candidate: null,
    };
  }

  const otaData = isOtaClassification(conversation.classification)
    ? parseOtaEmail(
        latestInbound.fromAddress ?? '',
        latestInbound.subject ?? '',
        latestInbound.htmlContent ?? '',
        latestInbound.content,
      )
    : null;

  const candidate = {
    name: otaData?.guestName ?? latestInbound.fromName ?? guessNameFromEmail(latestInbound.fromAddress),
    email: otaData?.guestEmail ?? latestInbound.fromAddress ?? null,
    phone: otaData?.guestPhone ?? null,
    shouldCreate: true,
  };

  let matchedGuest: { id: string; name: string; email: string | null } | null = null;
  if (candidate.email) {
    matchedGuest = await prisma.guest.findFirst({
      where: {
        email: { equals: candidate.email, mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true, name: true, email: true },
    });
  }

  if (!matchedGuest && candidate.name) {
    matchedGuest = await prisma.guest.findFirst({
      where: {
        name: { equals: candidate.name, mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true, name: true, email: true },
    });
  }

  if (matchedGuest) {
    return {
      status: 'matched_existing',
      classification: conversation.classification,
      reason: 'Existing guest match found from inbound email data',
      matchedGuest,
      candidate,
    };
  }

  if (!candidate.name && !candidate.email) {
    return {
      status: 'insufficient_data',
      classification: conversation.classification,
      reason: 'Not enough customer data to suggest a guest record',
      candidate: { ...candidate, shouldCreate: false },
    };
  }

  return {
    status: 'needs_create',
    classification: conversation.classification,
    reason: 'No existing guest matched; suggest creating a new guest',
    candidate,
  };
}

export async function linkConversationToGuest(
  prisma: PrismaClient,
  conversationId: string,
  guestId: string,
  actorId?: string,
): Promise<Conversation> {
  return prisma.$transaction(async (tx) => {
    const [conversation, guest] = await Promise.all([
      tx.conversation.findUnique({ where: { id: conversationId } }),
      tx.guest.findFirst({ where: { id: guestId, ...notDeleted } }),
    ]);

    if (!conversation) throw new NotFoundError('Conversation', conversationId);
    if (!guest) throw new NotFoundError('Guest', guestId);

    const updated = await tx.conversation.update({
      where: { id: conversationId },
      data: { guestId },
    });

    await writeAuditLog(tx, {
      entityType: 'conversation',
      entityId: conversationId,
      action: 'update',
      changes: {
        guestId: { from: conversation.guestId, to: guestId },
        trigger: 'manual_guest_link',
      },
      actor: getActor(actorId),
    });

    return updated as Conversation;
  });
}

export async function createGuestFromConversation(
  prisma: PrismaClient,
  conversationId: string,
  payload: {
    name?: string;
    email?: string;
    phone?: string;
    language?: 'en' | 'de';
  },
  actorId?: string,
): Promise<{ guest: { id: string; name: string; email: string | null }; conversation: Conversation }> {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { id: conversationId },
      include: {
        guest: { select: { id: true } },
        messages: {
          where: { direction: 'in' },
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: { fromAddress: true, fromName: true, content: true },
        },
      },
    });

    if (!conversation) throw new NotFoundError('Conversation', conversationId);
    if (conversation.guest) {
      throw new BadRequestError('Conversation is already linked to a guest');
    }

    const latestInbound = conversation.messages[0];
    const fallbackName = latestInbound?.fromName ?? guessNameFromEmail(latestInbound?.fromAddress ?? null);
    const name = payload.name?.trim() || fallbackName;
    const email = payload.email?.trim() || latestInbound?.fromAddress || null;
    const phone = payload.phone?.trim() || null;

    if (!name) {
      throw new BadRequestError('Guest name is required to create a new guest');
    }

    if (email) {
      const existingByEmail = await tx.guest.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          deletedAt: null,
        },
        select: { id: true, name: true, email: true },
      });

      if (existingByEmail) {
        const linkedConversation = await tx.conversation.update({
          where: { id: conversationId },
          data: { guestId: existingByEmail.id },
        });

        await writeAuditLog(tx, {
          entityType: 'conversation',
          entityId: conversationId,
          action: 'update',
          changes: {
            guestId: { from: null, to: existingByEmail.id },
            trigger: 'auto_link_existing_by_email',
          },
          actor: getActor(actorId),
        });

        return {
          guest: existingByEmail,
          conversation: linkedConversation as Conversation,
        };
      }
    }

    const language = payload.language
      ?? (latestInbound?.content ? detectLanguage(latestInbound.content) : 'en');

    const guest = await tx.guest.create({
      data: {
        name,
        email,
        phone,
        language,
        source: isOtaClassification(conversation.classification) ? 'ota-email' : 'email',
      },
      select: { id: true, name: true, email: true },
    });

    const updatedConversation = await tx.conversation.update({
      where: { id: conversationId },
      data: { guestId: guest.id },
    });

    await writeAuditLog(tx, {
      entityType: 'guest',
      entityId: guest.id,
      action: 'create',
      changes: {
        name: guest.name,
        email: guest.email,
        phone,
        language,
        source: isOtaClassification(conversation.classification) ? 'ota-email' : 'email',
        trigger: 'manual_create_from_inbox',
      },
      actor: getActor(actorId),
    });

    await writeAuditLog(tx, {
      entityType: 'conversation',
      entityId: conversationId,
      action: 'update',
      changes: {
        guestId: { from: null, to: guest.id },
        trigger: 'manual_guest_create',
      },
      actor: getActor(actorId),
    });

    return {
      guest,
      conversation: updatedConversation as Conversation,
    };
  });
}
