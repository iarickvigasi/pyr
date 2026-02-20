import type { PrismaClient, Channel, ConversationStatus, Prisma } from '@prisma/client';
import type { PaginatedResult } from '../../lib/pagination.js';
import { clampLimit } from '../../lib/pagination.js';
import { notDeleted } from '../../lib/prisma-helpers.js';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { NotFoundError } from '../../lib/errors.js';
import type { CreateConversationBody, ListConversationsQuery } from './inbox.schema.js';
import type { Conversation, ConversationWithMessages, AiDraft, Message } from '../../types/entities.js';

export async function listConversations(
  prisma: PrismaClient,
  query: ListConversationsQuery,
): Promise<PaginatedResult<Conversation & {
  guest: { id: string; name: string; email: string | null } | null;
  messages: Pick<Message, 'content' | 'direction' | 'sentAt'>[];
}>> {
  const limit = clampLimit(query.limit);
  const where: Prisma.ConversationWhereInput = {};

  if (query.status) where.status = query.status as ConversationStatus;
  if (query.guestId) where.guestId = query.guestId;

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

  return {
    data: data as (Conversation & {
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
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      guest: { select: { id: true, name: true, email: true, language: true } },
      messages: {
        orderBy: { sentAt: 'asc' },
      },
    },
  });

  if (!conversation) throw new NotFoundError('Conversation', id);
  return conversation as ConversationWithMessages;
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
