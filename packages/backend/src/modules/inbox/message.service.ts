import type { PrismaClient, Channel, MessageDirection } from '@prisma/client';
import { NotFoundError } from '../../lib/errors.js';
import type { AddMessageBody } from './inbox.schema.js';

export async function addMessage(
  prisma: PrismaClient,
  conversationId: string,
  data: AddMessageBody,
): Promise<Record<string, unknown>> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) throw new NotFoundError('Conversation', conversationId);

  const sentAt = data.sentAt ? new Date(data.sentAt) : new Date();

  const [message] = await prisma.$transaction([
    prisma.message.create({
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
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: sentAt },
    }),
  ]);

  return message as unknown as Record<string, unknown>;
}
