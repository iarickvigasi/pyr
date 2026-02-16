import type { PrismaClient, Channel, MessageDirection } from '@prisma/client';
import { writeAuditLog } from '../../lib/audit.js';
import { NotFoundError } from '../../lib/errors.js';
import type { AddMessageBody } from './inbox.schema.js';

export async function addMessage(
  prisma: PrismaClient,
  conversationId: string,
  data: AddMessageBody,
  actorId?: string,
): Promise<Record<string, unknown>> {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundError('Conversation', conversationId);

    const sentAt = data.sentAt ? new Date(data.sentAt) : new Date();

    const message = await tx.message.create({
      data: {
        conversationId,
        direction: data.direction as MessageDirection,
        content: data.content,
        channel: data.channel as Channel,
        messageId: data.messageId ?? null,
        inReplyTo: data.inReplyTo ?? null,
        references: data.references ?? null,
        sentAt,
      },
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: sentAt },
    });

    await writeAuditLog(tx as unknown as PrismaClient, {
      entityType: 'message',
      entityId: message.id,
      action: 'create',
      changes: { conversationId, direction: data.direction, channel: data.channel },
      actor: actorId ? `admin:${actorId}` : 'system',
    });

    return message as unknown as Record<string, unknown>;
  });
}
