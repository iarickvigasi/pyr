import type { PrismaClient, Channel, ConversationStatus, Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { PaginatedResult } from '../../lib/pagination.js';
import { clampLimit } from '../../lib/pagination.js';
import { notDeleted } from '../../lib/prisma-helpers.js';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { AppError, NotFoundError, BadRequestError } from '../../lib/errors.js';
import { stripMarkdownToPlainText } from '../../lib/markdown.js';
import { QUEUE_NAMES } from '@pyr/shared';
import type { AiDraftJobData } from '@pyr/shared';
import type { CreateConversationBody, ListConversationsQuery } from './inbox.schema.js';
import type { Conversation, ConversationWithMessages, AiDraft, Message, Booking } from '../../types/entities.js';
import {
  CONVERSATION_CLASSIFICATIONS,
  OTA_CLASSIFICATIONS,
  CONVERSATION_OTA_CLASSIFICATIONS,
  OTHER_CLASSIFICATIONS,
  normalizePrimaryClassification,
  isOtaClassification,
} from '../../services/email/inbox-classification.js';
import { parseOtaEmail } from '../../services/email/ota-parsers/index.js';
import { detectLanguage } from '../../services/email/language-detector.js';
import { createBooking } from '../bookings/booking.service.js';
import {
  analyzeBookingWithOpenClaw,
  type BookingAnalysisCandidate,
  type BookingMissingField,
} from '../../services/email/openclaw-booking-analyzer.js';

export async function listConversations(
  prisma: PrismaClient,
  query: ListConversationsQuery,
): Promise<PaginatedResult<Conversation & {
  isRead: boolean;
  messagePreview: string | null;
  guest: { id: string; name: string; email: string | null } | null;
  messages: Pick<Message, 'content' | 'direction' | 'sentAt'>[];
}>> {
  const limit = clampLimit(query.limit);
  const where: Prisma.ConversationWhereInput = {};

  if (query.status) where.status = query.status as ConversationStatus;
  if (query.guestId) where.guestId = query.guestId;
  if (query.bucket === 'conversation_ota') {
    where.OR = [
      { classification: { in: [...CONVERSATION_OTA_CLASSIFICATIONS] } },
      { classification: null },
    ];
  }
  if (query.bucket === 'conversation') {
    where.OR = [
      { classification: { in: [...CONVERSATION_CLASSIFICATIONS] } },
      { classification: null },
    ];
  }
  if (query.bucket === 'ota') {
    where.classification = { in: [...OTA_CLASSIFICATIONS] };
  }
  if (query.bucket === 'other') {
    where.classification = { in: [...OTHER_CLASSIFICATIONS] };
  }

  const conversations = await prisma.conversation.findMany({
    where,
    take: limit + 1,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
    include: {
      guest: { select: { id: true, name: true, email: true } },
      messages: {
        take: 1,
        orderBy: { sentAt: 'desc' },
        select: { content: true, direction: true, sentAt: true },
      },
    },
  });

  const hasMore = conversations.length > limit;
  const data = hasMore ? conversations.slice(0, limit) : conversations;

  // Compute messagePreview for each conversation
  const enriched = data.map((c) => {
    const lastMessage = c.messages[0];
    const messagePreview = lastMessage
      ? lastMessage.content.length > 80
        ? lastMessage.content.slice(0, 80) + '...'
        : lastMessage.content
      : null;
    return { ...c, messagePreview };
  });

  return {
    data: enriched as (Conversation & {
      isRead: boolean;
      messagePreview: string | null;
      guest: { id: string; name: string; email: string | null } | null;
      messages: Pick<Message, 'content' | 'direction' | 'sentAt'>[];
    })[],
    nextCursor: hasMore ? data[data.length - 1]!.id : null,
    hasMore,
  };
}

export async function getConversation(
  prisma: PrismaClient,
  id: string,
): Promise<ConversationWithMessages> {
  // Use a transaction to atomically mark as read and fetch
  const conversation = await prisma.$transaction(async (tx) => {
    // Mark as read when opened
    await tx.conversation.updateMany({
      where: { id, isRead: false },
      data: { isRead: true },
    });

    return tx.conversation.findUnique({
      where: { id },
      include: {
        guest: { select: { id: true, name: true, email: true, language: true } },
        messages: {
          orderBy: { sentAt: 'asc' },
          include: {
            attachments: {
              select: {
                id: true,
                filename: true,
                contentType: true,
                size: true,
                contentId: true,
              },
            },
          },
        },
        bookings: {
          where: { deletedAt: null },
          select: { id: true, status: true, needsReview: true },
        },
        eventBookings: {
          select: {
            id: true,
            status: true,
            attendeeCount: true,
            sourceConversationId: true,
            event: {
              select: {
                id: true,
                title: true,
                date: true,
                time: true,
                type: true,
              },
            },
          },
        },
      },
    });
  });

  if (!conversation) throw new NotFoundError('Conversation', id);
  const eventRegistrations = conversation.eventBookings;
  return {
    ...conversation,
    eventRegistrations,
  } as unknown as ConversationWithMessages;
}

/**
 * Get count of unread open conversations.
 */
export async function getUnreadCount(
  prisma: PrismaClient,
): Promise<number> {
  return prisma.conversation.count({
    where: { isRead: false, status: 'open' },
  });
}

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

export type ConversationBookingAnalysisStatus =
  | 'ready'
  | 'insufficient_data'
  | 'not_applicable'
  | 'error';

export interface ConversationBookingAnalysis {
  status: ConversationBookingAnalysisStatus;
  reason: string;
  classification: string | null;
  missingFields: BookingMissingField[];
  candidate: BookingAnalysisCandidate | null;
}

export interface CreateConversationBookingPayload {
  guest: {
    mode: 'linked' | 'existing' | 'create';
    guestId?: string;
    name?: string;
    email?: string;
    phone?: string;
    language?: 'en' | 'de';
  };
  booking: {
    roomId: string;
    checkIn: string;
    checkOut: string;
    totalPrice: number;
    status?: 'inquiry' | 'confirmed';
    source?: string | null;
    notes?: string | null;
  };
}

export async function getConversationBookingAnalysis(
  prisma: PrismaClient,
  app: FastifyInstance,
  conversationId: string,
): Promise<ConversationBookingAnalysis> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      classification: true,
      subject: true,
      messages: {
        orderBy: { sentAt: 'desc' },
        take: 8,
        select: {
          direction: true,
          fromAddress: true,
          fromName: true,
          subject: true,
          content: true,
        },
      },
    },
  });

  if (!conversation) {
    throw new NotFoundError('Conversation', conversationId);
  }

  const latestInbound = conversation.messages.find((m) => m.direction === 'in');
  if (!latestInbound) {
    return {
      status: 'insufficient_data',
      reason: 'No inbound message available to analyze booking data',
      classification: conversation.classification,
      missingFields: ['checkIn', 'checkOut'],
      candidate: null,
    };
  }

  if (!app.gateway) {
    return {
      status: 'error',
      reason: 'OpenClaw gateway is not available',
      classification: conversation.classification,
      missingFields: [],
      candidate: null,
    };
  }

  const analysis = await analyzeBookingWithOpenClaw({
    gateway: app.gateway,
    logger: app.log,
    conversationId,
    classification: conversation.classification,
    subject: conversation.subject,
    latestInboundMessage: {
      fromName: latestInbound.fromName,
      fromAddress: latestInbound.fromAddress,
      subject: latestInbound.subject,
      content: latestInbound.content,
    },
    recentMessages: [...conversation.messages]
      .reverse()
      .map((message) => ({
        direction: message.direction,
        content: message.content,
      })),
  });

  return {
    ...analysis,
    classification: conversation.classification,
  };
}

export async function createBookingFromConversation(
  prisma: PrismaClient,
  conversationId: string,
  payload: CreateConversationBookingPayload,
  actorId?: string,
): Promise<{
  booking: Booking;
  guest: { id: string; name: string; email: string | null };
  conversation: Conversation;
}> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      guest: { select: { id: true, name: true, email: true } },
      messages: {
        where: { direction: 'in' },
        orderBy: { sentAt: 'desc' },
        take: 1,
        select: { fromAddress: true, fromName: true, content: true },
      },
    },
  });

  if (!conversation) {
    throw new NotFoundError('Conversation', conversationId);
  }

  const latestInbound = conversation.messages[0];
  let resolvedGuest: { id: string; name: string; email: string | null } | null = null;

  if (payload.guest.mode === 'linked') {
    if (!conversation.guestId) {
      throw new BadRequestError('Conversation has no linked guest');
    }
    const linkedGuest = await prisma.guest.findFirst({
      where: { id: conversation.guestId, ...notDeleted },
      select: { id: true, name: true, email: true },
    });
    if (!linkedGuest) {
      throw new NotFoundError('Guest', conversation.guestId);
    }
    resolvedGuest = linkedGuest;
  }

  if (payload.guest.mode === 'existing') {
    const targetGuestId = payload.guest.guestId?.trim();
    if (!targetGuestId) {
      throw new BadRequestError('guest.guestId is required when mode=existing');
    }
    const existingGuest = await prisma.guest.findFirst({
      where: { id: targetGuestId, ...notDeleted },
      select: { id: true, name: true, email: true },
    });
    if (!existingGuest) {
      throw new NotFoundError('Guest', targetGuestId);
    }
    resolvedGuest = existingGuest;
  }

  if (payload.guest.mode === 'create') {
    const fallbackName = latestInbound?.fromName ?? guessNameFromEmail(latestInbound?.fromAddress ?? null);
    const name = payload.guest.name?.trim() || fallbackName;
    const email = payload.guest.email?.trim() || latestInbound?.fromAddress || null;
    const phone = payload.guest.phone?.trim() || null;
    const language = payload.guest.language
      ?? (latestInbound?.content ? detectLanguage(latestInbound.content) : 'en');

    if (!name) {
      throw new BadRequestError('Guest name is required to create a guest');
    }

    if (email) {
      const existingByEmail = await prisma.guest.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          deletedAt: null,
        },
        select: { id: true, name: true, email: true },
      });
      if (existingByEmail) {
        resolvedGuest = existingByEmail;
      }
    }

    if (!resolvedGuest) {
      const createdGuest = await prisma.guest.create({
        data: {
          name,
          email,
          phone,
          language,
          source: isOtaClassification(conversation.classification) ? 'ota-email' : 'email',
        },
        select: { id: true, name: true, email: true },
      });
      resolvedGuest = createdGuest;

      await writeAuditLog(prisma, {
        entityType: 'guest',
        entityId: createdGuest.id,
        action: 'create',
        changes: {
          name: createdGuest.name,
          email: createdGuest.email,
          phone,
          language,
          source: isOtaClassification(conversation.classification) ? 'ota-email' : 'email',
          trigger: 'manual_create_from_inbox_booking_wizard',
        },
        actor: getActor(actorId),
      });
    }
  }

  if (!resolvedGuest) {
    throw new BadRequestError('Unable to resolve guest for booking creation');
  }

  let updatedConversation = conversation as unknown as Conversation;
  if (conversation.guestId !== resolvedGuest.id) {
    const previousGuestId = conversation.guestId;
    updatedConversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: { guestId: resolvedGuest.id },
    }) as Conversation;

    await writeAuditLog(prisma, {
      entityType: 'conversation',
      entityId: conversationId,
      action: 'update',
      changes: {
        guestId: { from: previousGuestId, to: resolvedGuest.id },
        trigger: 'manual_guest_link_for_booking_creation',
      },
      actor: getActor(actorId),
    });
  }

  const createdBooking = await createBooking(prisma, {
    guestIds: [resolvedGuest.id],
    roomId: payload.booking.roomId,
    checkIn: payload.booking.checkIn,
    checkOut: payload.booking.checkOut,
    status: payload.booking.status ?? 'inquiry',
    totalPrice: payload.booking.totalPrice,
    source: payload.booking.source ?? null,
    notes: payload.booking.notes ?? null,
  }, actorId);

  const bookingWithSourceConversation = await prisma.booking.update({
    where: { id: createdBooking.id },
    data: { sourceConversationId: conversationId },
  });

  await writeAuditLog(prisma, {
    entityType: 'booking',
    entityId: createdBooking.id,
    action: 'update',
    changes: {
      sourceConversationId: {
        from: createdBooking.sourceConversationId,
        to: conversationId,
      },
      trigger: 'manual_inbox_booking_link',
    },
    actor: getActor(actorId),
  });

  const refreshedConversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!refreshedConversation) {
    throw new NotFoundError('Conversation', conversationId);
  }
  updatedConversation = refreshedConversation as Conversation;

  return {
    booking: bookingWithSourceConversation as Booking,
    guest: resolvedGuest,
    conversation: updatedConversation,
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

export async function createConversation(
  prisma: PrismaClient,
  data: CreateConversationBody,
  actorId?: string,
): Promise<Conversation> {
  return prisma.$transaction(async (tx) => {
    const guest = await tx.guest.findFirst({ where: { id: data.guestId, ...notDeleted } });
    if (!guest) throw new NotFoundError('Guest', data.guestId);

    const conversation = await tx.conversation.create({
      data: {
        guestId: data.guestId,
        channel: data.channel as Channel,
        subject: data.subject ?? null,
      },
    });

    await writeAuditLog(tx, {
      entityType: 'conversation',
      entityId: conversation.id,
      action: 'create',
      changes: data as unknown as Record<string, unknown>,
      actor: getActor(actorId),
    });

    return conversation as Conversation;
  });
}

export async function updateConversationStatus(
  prisma: PrismaClient,
  id: string,
  status: ConversationStatus,
  actorId?: string,
): Promise<Conversation> {
  return updateConversation(prisma, id, { status }, actorId);
}

/**
 * Update conversation fields (status and/or classification).
 * Wraps in a transaction with audit logging.
 */
export async function updateConversation(
  prisma: PrismaClient,
  id: string,
  data: { status?: ConversationStatus; classification?: string },
  actorId?: string,
): Promise<Conversation> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.conversation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Conversation', id);

    const updateData: Record<string, unknown> = {};
    const changes: Record<string, unknown> = {};

    if (data.status !== undefined) {
      updateData.status = data.status;
      changes.status = { from: existing.status, to: data.status };
    }

    if (data.classification !== undefined) {
      updateData.classification = data.classification;
      changes.classification = { from: existing.classification, to: data.classification };
    }

    const conversation = await tx.conversation.update({
      where: { id },
      data: updateData,
    });

    await writeAuditLog(tx, {
      entityType: 'conversation',
      entityId: id,
      action: 'update',
      changes,
      actor: getActor(actorId),
    });

    return conversation as Conversation;
  });
}

export async function listDrafts(
  prisma: PrismaClient,
  conversationId: string,
): Promise<AiDraft[]> {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new NotFoundError('Conversation', conversationId);

  const drafts = await prisma.aiDraft.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
  });

  return drafts as AiDraft[];
}

/**
 * Approve an AI draft: send email via SMTP, then update draft status and store outbound message.
 * SMTP send happens FIRST -- if it fails, draft stays pending (no stale data).
 */
export async function approveDraft(
  prisma: PrismaClient,
  app: FastifyInstance,
  conversationId: string,
  draftId: string,
  editedContent?: string,
  actorId?: string,
): Promise<{ messageId: string; sentAt: Date }> {
  // Find draft and verify ownership
  const draft = await prisma.aiDraft.findFirst({
    where: { id: draftId, conversationId },
  });

  if (!draft) {
    throw new NotFoundError('AiDraft', draftId);
  }

  if (draft.status !== 'pending' && draft.status !== 'failed') {
    throw new BadRequestError(
      `Cannot approve draft with status '${draft.status}' -- only pending or failed drafts can be approved`,
    );
  }

  // Determine final content and status
  const rawFinalContent = editedContent ?? draft.content;
  const finalContent = stripMarkdownToPlainText(rawFinalContent);
  if (!finalContent) {
    throw new BadRequestError('Cannot send: draft content is empty');
  }
  const finalStatus = editedContent ? 'edited' : 'approved';

  // Get conversation with guest and messages for threading
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      guest: { select: { id: true, name: true, email: true } },
      messages: {
        orderBy: { sentAt: 'desc' },
        select: { messageId: true, direction: true },
      },
    },
  });

  if (!conversation) {
    throw new NotFoundError('Conversation', conversationId);
  }

  const guestEmail = conversation.guest?.email;
  if (!guestEmail) {
    throw new BadRequestError('Cannot send: conversation has no guest email address');
  }

  // Build threading headers
  const lastInbound = conversation.messages.find(
    (m) => m.direction === 'in' && m.messageId,
  );
  const inReplyTo = lastInbound?.messageId ?? undefined;

  const allMessageIds = conversation.messages
    .filter((m) => m.messageId)
    .map((m) => m.messageId as string);

  const { buildReferencesChain } = await import('../../services/email/email-threader.js');
  const references = allMessageIds.length > 0
    ? buildReferencesChain(allMessageIds, inReplyTo ?? '')
      .filter(Boolean)
    : undefined;

  // SMTP send FIRST -- if this fails, draft stays pending
  const { createEmailModule } = await import('../../services/email/index.js');
  const emailModule = createEmailModule(app);
  const { messageId: sentMessageId } = await emailModule.sendEmail({
    to: guestEmail,
    subject: conversation.subject ?? '(no subject)',
    body: finalContent,
    inReplyTo,
    references,
  });

  // Then update draft + store outbound message in a transaction
  const sentAt = new Date();
  await prisma.$transaction(async (tx) => {
    // Update draft status
    await tx.aiDraft.update({
      where: { id: draftId },
      data: { status: finalStatus, content: finalContent },
    });

    // Create outbound message
    await tx.message.create({
      data: {
        conversationId,
        direction: 'out',
        content: finalContent,
        channel: 'email',
        messageId: sentMessageId,
        inReplyTo: inReplyTo ?? null,
        references: references?.join(' ') ?? null,
        fromAddress: process.env.EMAIL_USER ?? null,
        fromName: 'Puppy Yoga Retreat',
        subject: conversation.subject,
        sentAt,
      },
    });

    // Update conversation lastMessageAt
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: sentAt },
    });

    await writeAuditLog(tx, {
      entityType: 'ai_draft',
      entityId: draftId,
      action: 'update',
      changes: {
        status: { from: draft.status, to: finalStatus },
        trigger: 'ai-draft-approve',
        to: guestEmail,
      },
      actor: getActor(actorId),
    });
  });

  return { messageId: sentMessageId, sentAt };
}

/**
 * Reject an AI draft -- changes status to 'rejected'.
 */
export async function rejectDraft(
  prisma: PrismaClient,
  conversationId: string,
  draftId: string,
  actorId?: string,
): Promise<AiDraft> {
  const draft = await prisma.aiDraft.findFirst({
    where: { id: draftId, conversationId },
  });

  if (!draft) {
    throw new NotFoundError('AiDraft', draftId);
  }

  if (draft.status !== 'pending') {
    throw new BadRequestError(
      `Cannot reject draft with status '${draft.status}' -- only pending drafts can be rejected`,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedDraft = await tx.aiDraft.update({
      where: { id: draftId },
      data: { status: 'rejected' },
    });

    await writeAuditLog(tx, {
      entityType: 'ai_draft',
      entityId: draftId,
      action: 'update',
      changes: { status: { from: 'pending', to: 'rejected' } },
      actor: getActor(actorId),
    });

    return updatedDraft;
  });

  return updated as AiDraft;
}

/**
 * Manually trigger AI draft generation for the latest inbound message in a conversation.
 * Unlike regenerateDraft, this does not require an existing draft -- it finds the latest
 * inbound message and enqueues a new ai-draft job for it.
 */
export async function generateDraftForConversation(
  prisma: PrismaClient,
  app: FastifyInstance,
  conversationId: string,
  actor?: string,
): Promise<{ jobId: string; messageId: string }> {
  // 1. Verify conversation exists
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      guest: { select: { language: true } },
    },
  });

  if (!conversation) {
    throw new NotFoundError('Conversation', conversationId);
  }

  // 2. Find the latest inbound message
  const latestMessage = await prisma.message.findFirst({
    where: { conversationId },
    orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, direction: true },
  });

  if (!latestMessage) {
    throw new BadRequestError('No messages in conversation to generate a draft for');
  }
  if (latestMessage.direction !== 'in') {
    throw new BadRequestError('Latest message is outbound -- wait for a new inbound message before generating a draft');
  }

  // 3. Determine guest language
  const guestLanguage = (conversation.guest?.language === 'de' ? 'de' : 'en') as 'en' | 'de';

  // 4. Get the ai-draft queue
  const aiDraftQueue = app.queues?.getQueue(QUEUE_NAMES.AI_DRAFT);
  if (!aiDraftQueue) {
    throw new AppError(503, 'AI draft queue not available', 'SERVICE_UNAVAILABLE');
  }

  // 5. Enqueue ai-draft job
  const job = await aiDraftQueue.add('ai-draft', {
    conversationId,
    messageId: latestMessage.id,
    guestLanguage,
  } satisfies AiDraftJobData);

  // 6. Write audit log
  await writeAuditLog(prisma, {
    entityType: 'ai_draft',
    entityId: conversationId,
    action: 'create',
    changes: { messageId: latestMessage.id, trigger: 'manual_generate' },
    actor: getActor(actor),
  });

  return { jobId: job.id ?? 'unknown', messageId: latestMessage.id };
}

/**
 * Regenerate an AI draft -- rejects the old draft and enqueues a new AI draft job.
 */
export async function regenerateDraft(
  prisma: PrismaClient,
  app: FastifyInstance,
  conversationId: string,
  draftId: string,
  actorId?: string,
): Promise<{ queued: true }> {
  const draft = await prisma.aiDraft.findFirst({
    where: { id: draftId, conversationId },
  });

  if (!draft) {
    throw new NotFoundError('AiDraft', draftId);
  }

  if (draft.status !== 'pending' && draft.status !== 'rejected' && draft.status !== 'failed') {
    throw new BadRequestError(
      `Cannot regenerate draft with status '${draft.status}' -- only pending, rejected, or failed drafts can be regenerated`,
    );
  }

  // Mark old draft as rejected (no history kept)
  await prisma.$transaction(async (tx) => {
    await tx.aiDraft.update({
      where: { id: draftId },
      data: { status: 'rejected' },
    });

    await writeAuditLog(tx, {
      entityType: 'ai_draft',
      entityId: draftId,
      action: 'update',
      changes: {
        status: { from: draft.status, to: 'rejected' },
        trigger: 'ai-draft-regenerate',
      },
      actor: getActor(actorId),
    });
  });

  // Get guest language for the new draft
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      guest: { select: { language: true } },
    },
  });
  const guestLanguage = (conversation?.guest?.language === 'de' ? 'de' : 'en') as 'en' | 'de';

  // Enqueue new AI draft job
  const aiDraftQueue = app.queues?.getQueue(QUEUE_NAMES.AI_DRAFT);
  if (aiDraftQueue) {
    await aiDraftQueue.add('ai-draft', {
      conversationId,
      messageId: draft.messageId ?? '',
      guestLanguage,
    } satisfies AiDraftJobData);
  }

  return { queued: true };
}
