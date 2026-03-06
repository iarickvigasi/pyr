import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type {
  ConversationBookingAnalysisDto,
  CreateConversationBookingPayload as CreateConversationBookingPayloadDto,
} from '@pyr/shared';
import { notDeleted } from '../../lib/prisma-helpers.js';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { detectLanguage } from '../../services/email/language-detector.js';
import { createBooking } from '../bookings/booking.service.js';
import {
  analyzeBookingWithOpenClaw,
} from '../../services/email/openclaw-booking-analyzer.js';
import { isOtaClassification } from '../../services/email/inbox-classification.js';
import type { Conversation, Booking } from '../../types/entities.js';

export type ConversationBookingAnalysis = ConversationBookingAnalysisDto;
export type CreateConversationBookingPayload = CreateConversationBookingPayloadDto;

function guessNameFromEmail(email: string | null): string | null {
  if (!email) return null;
  const local = email.split('@')[0]?.trim();
  return local ? local : null;
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
