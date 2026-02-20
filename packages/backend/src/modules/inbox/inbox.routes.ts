import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ConversationStatus } from '@prisma/client';
import { idParamSchema } from '@pyr/shared';
import {
  createConversationSchema,
  updateConversationSchema,
  listConversationsQuerySchema,
  addMessageSchema,
  replySchema,
} from './inbox.schema.js';
import {
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  listDrafts,
} from './conversation.service.js';
import { addMessage } from './message.service.js';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';

export default async function inboxRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.addHook('onRequest', app.authenticate);

  server.get('/', {
    schema: { tags: ['Inbox'], summary: 'List conversations with status and guest filters', querystring: listConversationsQuerySchema },
  }, async (request) => {
    return listConversations(app.prisma, request.query);
  });

  server.get('/:id', {
    schema: { tags: ['Inbox'], summary: 'Get conversation with all messages', params: idParamSchema },
  }, async (request) => {
    return { data: await getConversation(app.prisma, request.params.id) };
  });

  server.post('/', {
    schema: { tags: ['Inbox'], summary: 'Create a new conversation for a guest', body: createConversationSchema },
  }, async (request, reply) => {
    const conversation = await createConversation(app.prisma, request.body, request.user?.sub);
    return reply.status(201).send({ data: conversation });
  });

  server.patch('/:id', {
    schema: { tags: ['Inbox'], summary: 'Update conversation status and/or classification', params: idParamSchema, body: updateConversationSchema },
  }, async (request) => {
    const body = request.body as { status?: string; classification?: string };
    const conversation = await updateConversation(
      app.prisma,
      request.params.id,
      {
        status: body.status as ConversationStatus | undefined,
        classification: body.classification,
      },
      request.user?.sub,
    );
    return { data: conversation };
  });

  server.post('/:id/messages', {
    schema: { tags: ['Inbox'], summary: 'Add a message to a conversation', params: idParamSchema, body: addMessageSchema },
  }, async (request, reply) => {
    const message = await addMessage(app.prisma, request.params.id, request.body, request.user?.sub);
    return reply.status(201).send({ data: message });
  });

  server.post('/:id/reply', {
    schema: { tags: ['Inbox'], summary: 'Send a reply to a conversation via SMTP', params: idParamSchema, body: replySchema },
  }, async (request, reply) => {
    const { id } = request.params;
    const body = request.body as { content: string; html?: string };

    // Get conversation with messages and guest
    const conversation = await app.prisma.conversation.findUnique({
      where: { id },
      include: {
        guest: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { sentAt: 'desc' },
          select: { messageId: true, direction: true },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation', id);
    }

    // Determine recipient email
    const guestEmail = conversation.guest?.email;
    if (!guestEmail) {
      throw new BadRequestError('Cannot reply: conversation has no guest email address');
    }

    // Build threading headers
    const lastInbound = conversation.messages.find(
      (m) => m.direction === 'in' && m.messageId,
    );
    const inReplyTo = lastInbound?.messageId ?? undefined;

    // Collect all message IDs for References (capped at 20)
    const allMessageIds = conversation.messages
      .filter((m) => m.messageId)
      .map((m) => m.messageId as string);

    // Dynamic import to avoid polluting module cache in test environments
    const { buildReferencesChain } = await import('../../services/email/email-threader.js');
    const references = allMessageIds.length > 0
      ? buildReferencesChain(allMessageIds, inReplyTo ?? '')
        .filter(Boolean)
      : undefined;

    // Dynamic import of email module to avoid transitive loading of IMAP/SMTP/audit
    // modules in test environments where the full email stack is not available
    const { createEmailModule } = await import('../../services/email/index.js');
    const emailModule = createEmailModule(app);
    const { messageId: sentMessageId } = await emailModule.sendEmail({
      to: guestEmail,
      subject: conversation.subject ?? '(no subject)',
      body: body.content,
      html: body.html,
      inReplyTo,
      references,
    });

    // Store outbound message in database
    const sentAt = new Date();
    const message = await app.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId: id,
          direction: 'out',
          content: body.content,
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
        where: { id },
        data: { lastMessageAt: sentAt },
      });

      await writeAuditLog(tx, {
        entityType: 'message',
        entityId: msg.id,
        action: 'create',
        changes: {
          conversationId: id,
          direction: 'out',
          channel: 'email',
          to: guestEmail,
          trigger: 'manual-reply',
        },
        actor: getActor(request.user?.sub),
      });

      return msg;
    });

    return reply.status(201).send({
      data: {
        messageId: sentMessageId,
        sentAt: message.sentAt,
      },
    });
  });

  server.get('/:id/drafts', {
    schema: { tags: ['Inbox'], summary: 'List AI drafts for a conversation', params: idParamSchema },
  }, async (request) => {
    return { data: await listDrafts(app.prisma, request.params.id) };
  });
}
