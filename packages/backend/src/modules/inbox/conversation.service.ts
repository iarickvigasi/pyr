import type { PrismaClient, Channel, ConversationStatus } from '@prisma/client';
import type { PaginatedResult } from '../../lib/pagination.js';
import { clampLimit } from '../../lib/pagination.js';
import { notDeleted } from '../../lib/prisma-helpers.js';
import { writeAuditLog } from '../../lib/audit.js';
import { NotFoundError } from '../../lib/errors.js';
import type { CreateConversationBody, ListConversationsQuery } from './inbox.schema.js';

function getActor(userId?: string): string {
  return userId ? `admin:${userId}` : 'system';
}

export async function listConversations(
  prisma: PrismaClient,
  query: ListConversationsQuery,
): Promise<PaginatedResult<Record<string, unknown>>> {
  const limit = clampLimit(query.limit);
  const where: Record<string, unknown> = {};

  if (query.status) where.status = query.status;
  if (query.guestId) where.guestId = query.guestId;

  const conversations = await prisma.conversation.findMany({
    where: where as any,
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
    data: data as unknown as Record<string, unknown>[],
    nextCursor: hasMore ? data[data.length - 1]!.id : null,
    hasMore,
  };
}

export async function getConversation(
  prisma: PrismaClient,
  id: string,
): Promise<Record<string, unknown>> {
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
  return conversation as unknown as Record<string, unknown>;
}

export async function createConversation(
  prisma: PrismaClient,
  data: CreateConversationBody,
  actorId?: string,
): Promise<Record<string, unknown>> {
  const guest = await prisma.guest.findFirst({ where: { id: data.guestId, ...notDeleted } });
  if (!guest) throw new NotFoundError('Guest', data.guestId);

  const conversation = await prisma.conversation.create({
    data: {
      guestId: data.guestId,
      channel: data.channel as Channel,
      subject: data.subject ?? null,
    },
  });

  await writeAuditLog(prisma, {
    entityType: 'conversation',
    entityId: conversation.id,
    action: 'create',
    changes: data as unknown as Record<string, unknown>,
    actor: getActor(actorId),
  });

  return conversation as unknown as Record<string, unknown>;
}

export async function updateConversationStatus(
  prisma: PrismaClient,
  id: string,
  status: ConversationStatus,
  actorId?: string,
): Promise<Record<string, unknown>> {
  const existing = await prisma.conversation.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Conversation', id);

  const conversation = await prisma.conversation.update({
    where: { id },
    data: { status },
  });

  await writeAuditLog(prisma, {
    entityType: 'conversation',
    entityId: id,
    action: 'update',
    changes: { status: { from: existing.status, to: status } },
    actor: getActor(actorId),
  });

  return conversation as unknown as Record<string, unknown>;
}

export async function listDrafts(
  prisma: PrismaClient,
  conversationId: string,
): Promise<Record<string, unknown>[]> {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new NotFoundError('Conversation', conversationId);

  const drafts = await prisma.aiDraft.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
  });

  return drafts as unknown as Record<string, unknown>[];
}
