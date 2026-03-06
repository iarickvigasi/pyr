import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { AppError, NotFoundError, BadRequestError } from '../../lib/errors.js';
import { stripMarkdownToPlainText } from '../../lib/markdown.js';
import { QUEUE_NAMES } from '@pyr/shared';
import type { AiDraftJobData } from '@pyr/shared';
import type { AiDraft } from '../../types/entities.js';

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

export async function approveDraft(
  prisma: PrismaClient,
  app: FastifyInstance,
  conversationId: string,
  draftId: string,
  editedContent?: string,
  actorId?: string,
): Promise<{ messageId: string; sentAt: Date }> {
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

  const rawFinalContent = editedContent ?? draft.content;
  const finalContent = stripMarkdownToPlainText(rawFinalContent);
  if (!finalContent) {
    throw new BadRequestError('Cannot send: draft content is empty');
  }
  const finalStatus = editedContent ? 'edited' : 'approved';

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

  const { createEmailModule } = await import('../../services/email/index.js');
  const emailModule = createEmailModule(app);
  const { messageId: sentMessageId } = await emailModule.sendEmail({
    to: guestEmail,
    subject: conversation.subject ?? '(no subject)',
    body: finalContent,
    inReplyTo,
    references,
  });

  const sentAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.aiDraft.update({
      where: { id: draftId },
      data: { status: finalStatus, content: finalContent },
    });

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

export async function generateDraftForConversation(
  prisma: PrismaClient,
  app: FastifyInstance,
  conversationId: string,
  actor?: string,
): Promise<{ jobId: string; messageId: string }> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      guest: { select: { language: true } },
    },
  });

  if (!conversation) {
    throw new NotFoundError('Conversation', conversationId);
  }

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

  const guestLanguage = (conversation.guest?.language === 'de' ? 'de' : 'en') as 'en' | 'de';

  const aiDraftQueue = app.queues?.getQueue(QUEUE_NAMES.AI_DRAFT);
  if (!aiDraftQueue) {
    throw new AppError(503, 'AI draft queue not available', 'SERVICE_UNAVAILABLE');
  }

  const job = await aiDraftQueue.add('ai-draft', {
    conversationId,
    messageId: latestMessage.id,
    guestLanguage,
  } satisfies AiDraftJobData);

  await writeAuditLog(prisma, {
    entityType: 'ai_draft',
    entityId: conversationId,
    action: 'create',
    changes: { messageId: latestMessage.id, trigger: 'manual_generate' },
    actor: getActor(actor),
  });

  return { jobId: job.id ?? 'unknown', messageId: latestMessage.id };
}

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

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      guest: { select: { language: true } },
    },
  });
  const guestLanguage = (conversation?.guest?.language === 'de' ? 'de' : 'en') as 'en' | 'de';

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
