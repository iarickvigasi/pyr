import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import type {
  Conversation,
  ConversationEventAnalysis,
  Event,
  EventBooking,
  EventType,
  Guest,
  PrismaClient,
} from '@prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { notDeleted } from '../../lib/prisma-helpers.js';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { detectLanguage } from '../../services/email/language-detector.js';
import {
  analyzeViatorEventWithOpenClaw,
  type OpenClawViatorEventAnalysisResult,
  type ViatorEventCandidate,
  type ViatorEventResolution,
  type ViatorEventMissingField,
  type ViatorEventIntent,
} from '../../services/email/openclaw-viator-event-analyzer.js';
import { isOtaClassification } from '../../services/email/inbox-classification.js';

export interface ConversationEventAnalysisData {
  status: 'pending' | 'ready' | 'insufficient_data' | 'not_applicable' | 'error';
  provider: string;
  reason: string;
  classification: string | null;
  intent: ViatorEventIntent;
  missingFields: ViatorEventMissingField[];
  candidate: ViatorEventCandidate | null;
  resolution: ViatorEventResolution | null;
  messageId: string | null;
  updatedAt?: Date;
}

export type GuestMode = 'linked' | 'existing' | 'create';

export interface EventGuestPayload {
  mode: GuestMode;
  guestId?: string;
  name?: string;
  email?: string;
  phone?: string;
  language?: 'en' | 'de';
  applyUpdates?: {
    name?: boolean;
    email?: boolean;
    phone?: boolean;
  };
}

export interface ExistingEventTargetPayload {
  mode: 'existing';
  eventId: string;
}

export interface CreateEventTargetPayload {
  mode: 'create';
  type: EventType;
  title: string;
  date: string;
  time: string;
  capacity: number;
  location?: string | null;
  description?: string | null;
}

export type EventTargetPayload = ExistingEventTargetPayload | CreateEventTargetPayload;

export type CreateOrLinkConversationEventPayload = {
  operation: 'create_or_link';
  guest: EventGuestPayload;
  event: EventTargetPayload;
  registration: {
    externalBookingId: string;
    externalProductCode?: string | null;
    attendeeCount?: number;
  };
};

export type CancelConversationEventPayload = {
  operation: 'cancel';
  externalBookingId: string;
};

export type MoveConversationEventPayload = {
  operation: 'move';
  externalBookingId: string;
  targetEvent: EventTargetPayload;
};

export type ApplyConversationEventPayload =
  | CreateOrLinkConversationEventPayload
  | CancelConversationEventPayload
  | MoveConversationEventPayload;

export interface ApplyConversationEventResult {
  conversation: Conversation;
  guest: { id: string; name: string; email: string | null } | null;
  event: Event | null;
  registration: EventBooking | null;
}

const VIATOR_PROVIDER = 'viator';
type DbClient = PrismaClient | Prisma.TransactionClient;

function guessNameFromEmail(email: string | null): string | null {
  if (!email) return null;
  const local = email.split('@')[0]?.trim();
  return local ? local : null;
}

function normalizeAttendeeCount(input: number | null | undefined): number {
  if (!input || !Number.isFinite(input)) return 1;
  return Math.max(1, Math.floor(input));
}

function mapAnalysisRow(
  row: ConversationEventAnalysis,
): ConversationEventAnalysisData {
  const candidate = row.candidateJson
    ? (row.candidateJson as unknown as ViatorEventCandidate)
    : null;
  const resolution = row.resolutionJson
    ? (row.resolutionJson as unknown as ViatorEventResolution)
    : null;
  const intent = row.intent
    ? (row.intent as ViatorEventIntent)
    : null;
  const missingFields = Array.isArray(row.missingFields)
    ? (row.missingFields as ViatorEventMissingField[])
    : [];

  return {
    status: row.status,
    provider: row.provider,
    reason: row.reason,
    classification: row.classification,
    intent,
    missingFields,
    candidate,
    resolution,
    messageId: row.messageId ?? null,
    updatedAt: row.updatedAt,
  };
}

export async function upsertConversationEventAnalysisPending(
  prisma: PrismaClient,
  params: {
    conversationId: string;
    messageId: string;
    classification: string | null;
    reason?: string;
  },
): Promise<ConversationEventAnalysisData> {
  const row = await prisma.conversationEventAnalysis.upsert({
    where: { conversationId: params.conversationId },
    create: {
      conversationId: params.conversationId,
      messageId: params.messageId,
      provider: VIATOR_PROVIDER,
      status: 'pending',
      reason: params.reason ?? 'Queued for automatic Viator analysis',
      classification: params.classification,
      intent: null,
      missingFields: [],
      candidateJson: Prisma.JsonNull,
      resolutionJson: Prisma.JsonNull,
    },
    update: {
      messageId: params.messageId,
      provider: VIATOR_PROVIDER,
      status: 'pending',
      reason: params.reason ?? 'Queued for automatic Viator analysis',
      classification: params.classification,
      intent: null,
      missingFields: [],
      candidateJson: Prisma.JsonNull,
      resolutionJson: Prisma.JsonNull,
    },
  });

  return mapAnalysisRow(row);
}

async function persistConversationEventAnalysis(
  prisma: PrismaClient,
  params: {
    conversationId: string;
    messageId: string | null;
    classification: string | null;
    analysis: OpenClawViatorEventAnalysisResult;
  },
): Promise<ConversationEventAnalysisData> {
  const row = await prisma.conversationEventAnalysis.upsert({
    where: { conversationId: params.conversationId },
    create: {
      conversationId: params.conversationId,
      messageId: params.messageId,
      provider: VIATOR_PROVIDER,
      status: params.analysis.status,
      reason: params.analysis.reason,
      classification: params.classification,
      intent: params.analysis.intent,
      missingFields: params.analysis.missingFields,
      candidateJson: params.analysis.candidate
        ? (params.analysis.candidate as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      resolutionJson: params.analysis.resolution
        ? (params.analysis.resolution as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
    update: {
      messageId: params.messageId,
      provider: VIATOR_PROVIDER,
      status: params.analysis.status,
      reason: params.analysis.reason,
      classification: params.classification,
      intent: params.analysis.intent,
      missingFields: params.analysis.missingFields,
      candidateJson: params.analysis.candidate
        ? (params.analysis.candidate as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      resolutionJson: params.analysis.resolution
        ? (params.analysis.resolution as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });

  return mapAnalysisRow(row);
}

export async function getConversationEventAnalysis(
  prisma: PrismaClient,
  conversationId: string,
): Promise<ConversationEventAnalysisData | null> {
  const row = await prisma.conversationEventAnalysis.findUnique({
    where: { conversationId },
  });
  if (!row) return null;
  return mapAnalysisRow(row);
}

export async function runConversationEventAnalysis(
  prisma: PrismaClient,
  app: FastifyInstance,
  conversationId: string,
  preferredMessageId?: string | null,
): Promise<ConversationEventAnalysisData> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      guest: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      messages: {
        orderBy: { sentAt: 'desc' },
        take: 8,
        select: {
          id: true,
          direction: true,
          fromAddress: true,
          fromName: true,
          subject: true,
          content: true,
        },
      },
      eventBookings: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: {
          id: true,
          externalBookingId: true,
          eventId: true,
          status: true,
        },
      },
    },
  });

  if (!conversation) {
    throw new NotFoundError('Conversation', conversationId);
  }

  const latestInbound = preferredMessageId
    ? conversation.messages.find((message) => message.id === preferredMessageId && message.direction === 'in')
    : null;
  const selectedInbound = latestInbound
    ?? conversation.messages.find((message) => message.direction === 'in');

  if (!selectedInbound) {
    return persistConversationEventAnalysis(prisma, {
      conversationId,
      messageId: preferredMessageId ?? null,
      classification: conversation.classification,
      analysis: {
        status: 'insufficient_data',
        reason: 'No inbound message available for Viator analysis',
        intent: null,
        missingFields: ['externalBookingId', 'eventDate', 'eventTime'],
        candidate: null,
        resolution: null,
      },
    });
  }

  if (!app.gateway) {
    return persistConversationEventAnalysis(prisma, {
      conversationId,
      messageId: selectedInbound.id,
      classification: conversation.classification,
      analysis: {
        status: 'error',
        reason: 'OpenClaw gateway is not available',
        intent: null,
        missingFields: [],
        candidate: null,
        resolution: null,
      },
    });
  }

  const analysis = await analyzeViatorEventWithOpenClaw({
    gateway: app.gateway,
    logger: app.log,
    conversationId,
    classification: conversation.classification,
    subject: conversation.subject,
    latestInboundMessage: {
      fromName: selectedInbound.fromName,
      fromAddress: selectedInbound.fromAddress,
      subject: selectedInbound.subject,
      content: selectedInbound.content,
    },
    recentMessages: [...conversation.messages]
      .reverse()
      .map((message) => ({
        direction: message.direction,
        content: message.content,
      })),
    linkedContext: {
      guest: conversation.guest,
      existingRegistration: conversation.eventBookings[0]
        ? {
            id: conversation.eventBookings[0].id,
            externalBookingId: conversation.eventBookings[0].externalBookingId,
            eventId: conversation.eventBookings[0].eventId,
            status: conversation.eventBookings[0].status,
          }
        : null,
    },
  });

  return persistConversationEventAnalysis(prisma, {
    conversationId,
    messageId: selectedInbound.id,
    classification: conversation.classification,
    analysis,
  });
}

async function ensureConversation(
  prisma: DbClient,
  conversationId: string,
): Promise<Conversation & {
  guest: Pick<Guest, 'id' | 'name' | 'email' | 'phone'> | null;
  messages: Array<{
    direction: 'in' | 'out';
    fromAddress: string | null;
    fromName: string | null;
    content: string;
  }>;
}> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      guest: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      messages: {
        where: { direction: 'in' },
        orderBy: { sentAt: 'desc' },
        take: 1,
        select: {
          direction: true,
          fromAddress: true,
          fromName: true,
          content: true,
        },
      },
    },
  });
  if (!conversation) throw new NotFoundError('Conversation', conversationId);
  return conversation;
}

async function resolveGuestForAction(
  tx: DbClient,
  conversation: Conversation & {
    guest: Pick<Guest, 'id' | 'name' | 'email' | 'phone'> | null;
    messages: Array<{
      direction: 'in' | 'out';
      fromAddress: string | null;
      fromName: string | null;
      content: string;
    }>;
  },
  guestPayload: EventGuestPayload,
  actorId?: string,
): Promise<{ id: string; name: string; email: string | null }> {
  const latestInbound = conversation.messages[0];

  let guest: { id: string; name: string; email: string | null; phone: string | null } | null = null;
  if (guestPayload.mode === 'linked') {
    if (!conversation.guestId) {
      throw new BadRequestError('Conversation has no linked guest');
    }
    guest = await tx.guest.findFirst({
      where: { id: conversation.guestId, ...notDeleted },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!guest) throw new NotFoundError('Guest', conversation.guestId);
  } else if (guestPayload.mode === 'existing') {
    const guestId = guestPayload.guestId?.trim();
    if (!guestId) {
      throw new BadRequestError('guest.guestId is required for existing mode');
    }
    guest = await tx.guest.findFirst({
      where: { id: guestId, ...notDeleted },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!guest) throw new NotFoundError('Guest', guestId);
  } else {
    const fallbackName = latestInbound?.fromName ?? guessNameFromEmail(latestInbound?.fromAddress ?? null);
    const name = guestPayload.name?.trim() || fallbackName;
    const email = guestPayload.email?.trim() || latestInbound?.fromAddress || null;
    const phone = guestPayload.phone?.trim() || null;
    const language = guestPayload.language
      ?? (latestInbound?.content ? detectLanguage(latestInbound.content) : 'en');

    if (!name) {
      throw new BadRequestError('Guest name is required to create guest');
    }

    if (email) {
      guest = await tx.guest.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          ...notDeleted,
        },
        select: { id: true, name: true, email: true, phone: true },
      });
    }

    if (!guest) {
      guest = await tx.guest.create({
        data: {
          name,
          email,
          phone,
          language,
          source: isOtaClassification(conversation.classification) ? 'ota-email' : 'email',
        },
        select: { id: true, name: true, email: true, phone: true },
      });

      await writeAuditLog(tx, {
        entityType: 'guest',
        entityId: guest.id,
        action: 'create',
        changes: {
          name,
          email,
          phone,
          language,
          trigger: 'inbox_event_create_or_link',
        },
        actor: getActor(actorId),
      });
    }
  }

  if (!guest) {
    throw new BadRequestError('Unable to resolve guest');
  }

  if (guestPayload.applyUpdates) {
    const updateData: Record<string, string | null> = {};
    if (guestPayload.applyUpdates.name && guestPayload.name?.trim()) {
      updateData.name = guestPayload.name.trim();
    }
    if (guestPayload.applyUpdates.email && guestPayload.email?.trim()) {
      const email = guestPayload.email.trim();
      const duplicate = await tx.guest.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          id: { not: guest.id },
          ...notDeleted,
        },
      });
      if (duplicate) {
        throw new ConflictError(`Guest with email '${email}' already exists`);
      }
      updateData.email = email;
    }
    if (guestPayload.applyUpdates.phone && guestPayload.phone?.trim()) {
      updateData.phone = guestPayload.phone.trim();
    }

    if (Object.keys(updateData).length > 0) {
      const updated = await tx.guest.update({
        where: { id: guest.id },
        data: updateData,
        select: { id: true, name: true, email: true, phone: true },
      });
      guest = updated;

      await writeAuditLog(tx, {
        entityType: 'guest',
        entityId: guest.id,
        action: 'update',
        changes: updateData,
        actor: getActor(actorId),
      });
    }
  }

  if (conversation.guestId !== guest.id) {
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { guestId: guest.id },
    });
    await writeAuditLog(tx, {
      entityType: 'conversation',
      entityId: conversation.id,
      action: 'update',
      changes: {
        guestId: { from: conversation.guestId, to: guest.id },
        trigger: 'inbox_event_guest_link',
      },
      actor: getActor(actorId),
    });
  }

  return { id: guest.id, name: guest.name, email: guest.email };
}

async function resolveEventTarget(
  tx: DbClient,
  payload: EventTargetPayload,
  actorId?: string,
): Promise<Event> {
  if (payload.mode === 'existing') {
    const existing = await tx.event.findUnique({ where: { id: payload.eventId } });
    if (!existing) throw new NotFoundError('Event', payload.eventId);
    return existing;
  }

  const created = await tx.event.create({
    data: {
      type: payload.type,
      title: payload.title,
      date: new Date(payload.date),
      time: payload.time,
      capacity: payload.capacity,
      location: payload.location ?? null,
      description: payload.description ?? null,
    },
  });

  await writeAuditLog(tx, {
    entityType: 'event',
    entityId: created.id,
    action: 'create',
    changes: {
      type: payload.type,
      title: payload.title,
      date: payload.date,
      time: payload.time,
      capacity: payload.capacity,
      location: payload.location ?? null,
      description: payload.description ?? null,
      trigger: 'inbox_event_create_or_link',
    },
    actor: getActor(actorId),
  });

  return created;
}

async function computeRegistrationStatus(
  tx: DbClient,
  eventId: string,
  attendeeCount: number,
  excludeRegistrationId?: string,
): Promise<'confirmed' | 'waitlisted'> {
  const event = await tx.event.findUnique({ where: { id: eventId } });
  if (!event) throw new NotFoundError('Event', eventId);

  const aggregate = await tx.eventBooking.aggregate({
    where: {
      eventId,
      status: 'confirmed',
      ...(excludeRegistrationId ? { id: { not: excludeRegistrationId } } : {}),
    },
    _sum: { attendeeCount: true },
  });
  const confirmedAttendees = aggregate._sum.attendeeCount ?? 0;
  return (confirmedAttendees + attendeeCount) <= event.capacity ? 'confirmed' : 'waitlisted';
}

export async function applyConversationEventAction(
  prisma: PrismaClient,
  conversationId: string,
  payload: ApplyConversationEventPayload,
  actorId?: string,
): Promise<ApplyConversationEventResult> {
  return prisma.$transaction(async (tx) => {
    const conversation = await ensureConversation(tx, conversationId);

    if (payload.operation === 'cancel') {
      const bookingId = payload.externalBookingId.trim();
      if (!bookingId) {
        throw new BadRequestError('externalBookingId is required');
      }
      const existing = await tx.eventBooking.findFirst({
        where: {
          externalProvider: VIATOR_PROVIDER,
          externalBookingId: bookingId,
        },
      });
      if (!existing) {
        throw new NotFoundError('EventBooking', bookingId);
      }

      const registration = await tx.eventBooking.update({
        where: { id: existing.id },
        data: {
          status: 'cancelled',
          sourceConversationId: conversationId,
        },
      });

      await writeAuditLog(tx, {
        entityType: 'event_booking',
        entityId: registration.id,
        action: 'update',
        changes: {
          status: { from: existing.status, to: 'cancelled' },
          sourceConversationId: conversationId,
          trigger: 'inbox_event_cancel',
        },
        actor: getActor(actorId),
      });

      const event = await tx.event.findUnique({ where: { id: registration.eventId } });
      const refreshedConversation = await tx.conversation.findUnique({ where: { id: conversationId } });
      if (!refreshedConversation) throw new NotFoundError('Conversation', conversationId);

      return {
        conversation: refreshedConversation,
        guest: null,
        event,
        registration,
      };
    }

    if (payload.operation === 'move') {
      const bookingId = payload.externalBookingId.trim();
      if (!bookingId) throw new BadRequestError('externalBookingId is required');

      const existing = await tx.eventBooking.findFirst({
        where: {
          externalProvider: VIATOR_PROVIDER,
          externalBookingId: bookingId,
        },
      });
      if (!existing) {
        throw new NotFoundError('EventBooking', bookingId);
      }

      const targetEvent = await resolveEventTarget(tx, payload.targetEvent, actorId);
      const newStatus = await computeRegistrationStatus(
        tx,
        targetEvent.id,
        existing.attendeeCount,
        existing.id,
      );

      const registration = await tx.eventBooking.update({
        where: { id: existing.id },
        data: {
          eventId: targetEvent.id,
          status: newStatus,
          sourceConversationId: conversationId,
        },
      });

      await writeAuditLog(tx, {
        entityType: 'event_booking',
        entityId: registration.id,
        action: 'update',
        changes: {
          eventId: { from: existing.eventId, to: targetEvent.id },
          status: { from: existing.status, to: newStatus },
          sourceConversationId: conversationId,
          trigger: 'inbox_event_move',
        },
        actor: getActor(actorId),
      });

      const refreshedConversation = await tx.conversation.findUnique({ where: { id: conversationId } });
      if (!refreshedConversation) throw new NotFoundError('Conversation', conversationId);

      return {
        conversation: refreshedConversation,
        guest: null,
        event: targetEvent,
        registration,
      };
    }

    const registrationBookingId = payload.registration.externalBookingId.trim();
    if (!registrationBookingId) {
      throw new BadRequestError('registration.externalBookingId is required');
    }

    const resolvedGuest = await resolveGuestForAction(tx, conversation, payload.guest, actorId);
    const targetEvent = await resolveEventTarget(tx, payload.event, actorId);
    const attendeeCount = normalizeAttendeeCount(payload.registration.attendeeCount);

    const existingByExternal = await tx.eventBooking.findFirst({
      where: {
        externalProvider: VIATOR_PROVIDER,
        externalBookingId: registrationBookingId,
      },
    });

    let registration: EventBooking;
    if (existingByExternal) {
      const status = await computeRegistrationStatus(
        tx,
        targetEvent.id,
        attendeeCount,
        existingByExternal.id,
      );

      registration = await tx.eventBooking.update({
        where: { id: existingByExternal.id },
        data: {
          eventId: targetEvent.id,
          guestId: resolvedGuest.id,
          status,
          attendeeCount,
          externalProvider: VIATOR_PROVIDER,
          externalBookingId: registrationBookingId,
          externalProductCode: payload.registration.externalProductCode ?? null,
          sourceConversationId: conversationId,
        },
      });

      await writeAuditLog(tx, {
        entityType: 'event_booking',
        entityId: registration.id,
        action: 'update',
        changes: {
          eventId: { from: existingByExternal.eventId, to: targetEvent.id },
          guestId: { from: existingByExternal.guestId, to: resolvedGuest.id },
          attendeeCount,
          externalProductCode: payload.registration.externalProductCode ?? null,
          sourceConversationId: conversationId,
          trigger: 'inbox_event_create_or_link',
        },
        actor: getActor(actorId),
      });
    } else {
      const existingByPair = await tx.eventBooking.findUnique({
        where: {
          eventId_guestId: {
            eventId: targetEvent.id,
            guestId: resolvedGuest.id,
          },
        },
      });
      const status = await computeRegistrationStatus(
        tx,
        targetEvent.id,
        attendeeCount,
        existingByPair?.id,
      );

      if (existingByPair) {
        registration = await tx.eventBooking.update({
          where: { id: existingByPair.id },
          data: {
            status,
            attendeeCount,
            externalProvider: VIATOR_PROVIDER,
            externalBookingId: registrationBookingId,
            externalProductCode: payload.registration.externalProductCode ?? null,
            sourceConversationId: conversationId,
          },
        });
      } else {
        registration = await tx.eventBooking.create({
          data: {
            eventId: targetEvent.id,
            guestId: resolvedGuest.id,
            status,
            attendeeCount,
            externalProvider: VIATOR_PROVIDER,
            externalBookingId: registrationBookingId,
            externalProductCode: payload.registration.externalProductCode ?? null,
            sourceConversationId: conversationId,
          },
        });
      }

      await writeAuditLog(tx, {
        entityType: 'event_booking',
        entityId: registration.id,
        action: existingByPair ? 'update' : 'create',
        changes: {
          eventId: targetEvent.id,
          guestId: resolvedGuest.id,
          status: registration.status,
          attendeeCount,
          externalProvider: VIATOR_PROVIDER,
          externalBookingId: registrationBookingId,
          externalProductCode: payload.registration.externalProductCode ?? null,
          sourceConversationId: conversationId,
          trigger: 'inbox_event_create_or_link',
        },
        actor: getActor(actorId),
      });
    }

    const refreshedConversation = await tx.conversation.findUnique({ where: { id: conversationId } });
    if (!refreshedConversation) throw new NotFoundError('Conversation', conversationId);

    return {
      conversation: refreshedConversation,
      guest: resolvedGuest,
      event: targetEvent,
      registration,
    };
  });
}
