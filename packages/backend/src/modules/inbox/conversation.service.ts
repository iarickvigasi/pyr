import type { PrismaClient, Channel, ConversationStatus, Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { PaginatedResult } from '../../lib/pagination.js';
import { clampLimit } from '../../lib/pagination.js';
import { notDeleted } from '../../lib/prisma-helpers.js';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { QUEUE_NAMES } from '@pyr/shared';
import type { AiDraftJobData } from '@pyr/shared';
import type { CreateConversationBody, ListConversationsQuery } from './inbox.schema.js';
import type { Conversation, ConversationWithMessages, AiDraft, Message } from '../../types/entities.js';

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
      },
    });
  });

  if (!conversation) throw new NotFoundError('Conversation', id);
  return conversation as unknown as ConversationWithMessages;
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
  const finalContent = editedContent ?? draft.content;
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
