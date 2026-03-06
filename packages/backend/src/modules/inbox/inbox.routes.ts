import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ConversationStatus } from '@prisma/client';
import {
  idParamSchema,
  QUEUE_NAMES,
  type InboxTelegramNotifyJobData,
} from '@pyr/shared';
import {
  createConversationSchema,
  updateConversationSchema,
  listConversationsQuerySchema,
  addMessageSchema,
  replySchema,
  unreadCountResponseSchema,
  attachmentParamsSchema,
  draftActionParamsSchema,
  approveDraftBodySchema,
  generateDraftParamsSchema,
  customerSuggestionSchema,
  linkConversationGuestBodySchema,
  createConversationGuestBodySchema,
  conversationBookingAnalysisResponseSchema,
  createConversationBookingBodySchema,
  conversationEventAnalysisResponseSchema,
  applyConversationEventBodySchema,
  type CreateConversationBookingBody,
  type ApplyConversationEventBody,
} from './inbox.schema.js';
import {
  listConversations,
  getConversation,
  getUnreadCount,
  createConversation,
  updateConversation,
  listDrafts,
  approveDraft,
  rejectDraft,
  regenerateDraft,
  generateDraftForConversation,
  getConversationCustomerSuggestion,
  linkConversationToGuest,
  createGuestFromConversation,
  getConversationBookingAnalysis,
  createBookingFromConversation,
} from './conversation.service.js';
import {
  applyConversationEventAction,
  getConversationEventAnalysis,
  runConversationEventAnalysis,
} from './conversation-event.service.js';
import { addMessage } from './message.service.js';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { NotFoundError, BadRequestError } from '../../lib/errors.js';
import { shouldNotifyInboxTelegramForClassification } from '../notifications/notification.service.js';
import { enqueueCalendarSyncJob } from '../../services/caldav/calendar-sync-queue.js';

export default async function inboxRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.addHook('onRequest', app.authenticate);

  server.get('/', {
    schema: { tags: ['Inbox'], summary: 'List conversations with status and guest filters', querystring: listConversationsQuerySchema },
  }, async (request) => {
    return listConversations(app.prisma, request.query);
  });

  // Register unread-count BEFORE /:id to avoid path conflicts
  server.get('/unread-count', {
    schema: {
      tags: ['Inbox'],
      summary: 'Get count of unread open conversations',
      response: { 200: unreadCountResponseSchema },
    },
  }, async () => {
    const count = await getUnreadCount(app.prisma);
    return { data: { count } };
  });

  server.get('/:id', {
    schema: { tags: ['Inbox'], summary: 'Get conversation with all messages', params: idParamSchema },
  }, async (request) => {
    return { data: await getConversation(app.prisma, request.params.id) };
  });

  server.get('/:id/customer-suggestion', {
    schema: {
      tags: ['Inbox'],
      summary: 'Get customer linking/creation suggestion for a conversation',
      params: idParamSchema,
      response: {
        200: customerSuggestionSchema,
      },
    },
  }, async (request) => {
    const suggestion = await getConversationCustomerSuggestion(app.prisma, request.params.id);
    return { data: suggestion };
  });

  server.post('/:id/booking-analysis', {
    schema: {
      tags: ['Inbox'],
      summary: 'Analyze booking potential from conversation thread using OpenClaw',
      params: idParamSchema,
      response: {
        200: conversationBookingAnalysisResponseSchema,
      },
    },
  }, async (request) => {
    const analysis = await getConversationBookingAnalysis(app.prisma, app, request.params.id);
    return { data: analysis };
  });

  server.post('/:id/bookings', {
    schema: {
      tags: ['Inbox'],
      summary: 'Create booking from inbox conversation using booking wizard payload',
      params: idParamSchema,
      body: createConversationBookingBodySchema,
    },
  }, async (request, reply) => {
    const conversationId = request.params.id;
    const body = request.body as CreateConversationBookingBody;
    app.log.info(
      {
        conversationId,
        guestMode: body.guest.mode,
      },
      'Creating booking from inbox conversation',
    );

    try {
      const result = await createBookingFromConversation(
        app.prisma,
        conversationId,
        body,
        request.user?.sub,
      );
      app.log.info(
        {
          conversationId,
          guestMode: body.guest.mode,
          bookingId: result.booking.id,
          guestId: result.guest.id,
        },
        'Created booking from inbox conversation',
      );
      return reply.code(201).send({ data: result });
    } catch (err) {
      app.log.warn(
        {
          conversationId,
          guestMode: body.guest.mode,
          err,
        },
        'Failed to create booking from inbox conversation',
      );
      throw err;
    }
  });

  server.get('/:id/event-analysis', {
    schema: {
      tags: ['Inbox'],
      summary: 'Get latest persisted Viator event analysis for a conversation',
      params: idParamSchema,
      response: {
        200: conversationEventAnalysisResponseSchema,
      },
    },
  }, async (request) => {
    const analysis = await getConversationEventAnalysis(app.prisma, request.params.id);
    if (!analysis) {
      return {
        data: {
          status: 'pending' as const,
          provider: 'viator',
          reason: 'No analysis yet for this conversation',
          classification: null,
          intent: null,
          missingFields: [],
          candidate: null,
          resolution: null,
          messageId: null,
        },
      };
    }
    return { data: analysis };
  });

  server.post('/:id/event-analysis', {
    schema: {
      tags: ['Inbox'],
      summary: 'Run Viator event analysis now and persist result',
      params: idParamSchema,
      response: {
        200: conversationEventAnalysisResponseSchema,
      },
    },
  }, async (request) => {
    const analysis = await runConversationEventAnalysis(app.prisma, app, request.params.id);
    return { data: analysis };
  });

  server.post('/:id/events', {
    schema: {
      tags: ['Inbox'],
      summary: 'Apply inbox event action (create/link/cancel/move) for conversation',
      params: idParamSchema,
      body: applyConversationEventBodySchema,
    },
  }, async (request, reply) => {
    const conversationId = request.params.id;
    const body = request.body as ApplyConversationEventBody;
    const externalBookingId = (
      body.operation === 'create_or_link'
        ? body.registration.externalBookingId
        : body.externalBookingId
    ).trim();
    const existingByExternal = externalBookingId
      ? await app.prisma.eventBooking.findFirst({
        where: {
          externalProvider: 'viator',
          externalBookingId,
        },
        select: { eventId: true },
      })
      : null;

    app.log.info(
      {
        conversationId,
        operation: body.operation,
      },
      'inbox_event_apply_started',
    );

    try {
      const result = await applyConversationEventAction(
        app.prisma,
        conversationId,
        body,
        request.user?.sub,
      );
      app.log.info(
        {
          conversationId,
          operation: body.operation,
          eventId: result.event?.id ?? null,
          guestId: result.guest?.id ?? null,
          eventBookingId: result.registration?.id ?? null,
          externalBookingId: result.registration?.externalBookingId ?? null,
        },
        'inbox_event_apply_completed',
      );

      const touchedEventIds = new Set<string>();
      if (existingByExternal?.eventId) touchedEventIds.add(existingByExternal.eventId);
      if (result.event?.id) touchedEventIds.add(result.event.id);
      if (result.registration?.eventId) touchedEventIds.add(result.registration.eventId);

      for (const eventId of touchedEventIds) {
        await enqueueCalendarSyncJob({
          app,
          entityType: 'event',
          entityId: eventId,
          action: 'update',
          errorLogMessage: 'Failed to enqueue calendar sync job for inbox event action',
        });
      }

      return reply.code(201).send({ data: result });
    } catch (err) {
      app.log.warn(
        {
          conversationId,
          operation: body.operation,
          err,
        },
        'inbox_event_apply_failed',
      );
      throw err;
    }
  });

  server.post('/:id/link-guest', {
    schema: {
      tags: ['Inbox'],
      summary: 'Link an existing guest to a conversation',
      params: idParamSchema,
      body: linkConversationGuestBodySchema,
    },
  }, async (request) => {
    const body = request.body as { guestId: string };
    const conversation = await linkConversationToGuest(
      app.prisma,
      request.params.id,
      body.guestId,
      request.user?.sub,
    );
    return { data: conversation };
  });

  server.post('/:id/create-guest', {
    schema: {
      tags: ['Inbox'],
      summary: 'Create a new guest from conversation sender data and link it',
      params: idParamSchema,
      body: createConversationGuestBodySchema,
    },
  }, async (request, reply) => {
    const body = request.body as {
      name?: string;
      email?: string;
      phone?: string;
      language?: 'en' | 'de';
    };
    const result = await createGuestFromConversation(
      app.prisma,
      request.params.id,
      body,
      request.user?.sub,
    );
    return reply.code(201).send({ data: result });
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
    const conversationId = request.params.id;
    const existingConversation = await app.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, classification: true },
    });
    if (!existingConversation) {
      throw new NotFoundError('Conversation', conversationId);
    }

    const conversation = await updateConversation(
      app.prisma,
      conversationId,
      {
        status: body.status as ConversationStatus | undefined,
        classification: body.classification,
      },
      request.user?.sub,
    );

    if (
      body.classification !== undefined
      && body.classification !== existingConversation.classification
    ) {
      const shouldNotifyBefore = await shouldNotifyInboxTelegramForClassification(
        app,
        existingConversation.classification,
      );
      const shouldNotifyAfter = await shouldNotifyInboxTelegramForClassification(
        app,
        body.classification,
      );

      if (!shouldNotifyBefore && shouldNotifyAfter) {
        const latestInbound = await app.prisma.message.findFirst({
          where: {
            conversationId,
            direction: 'in',
          },
          select: { id: true },
          orderBy: { sentAt: 'desc' },
        });

        if (latestInbound) {
          try {
            const inboxNotifyQueue = app.queues?.getQueue(QUEUE_NAMES.INBOX_TELEGRAM_NOTIFY);
            if (inboxNotifyQueue) {
              await inboxNotifyQueue.add('inbox-telegram-notify', {
                conversationId,
                messageId: latestInbound.id,
                classification: body.classification,
              } satisfies InboxTelegramNotifyJobData, {
                // BullMQ custom job IDs cannot include ':'.
                jobId: [
                  'inbox-telegram-notify-manual-reclass',
                  conversationId,
                  latestInbound.id,
                  body.classification,
                ].join('-'),
              });
            } else {
              app.log.error(
                { conversationId, messageId: latestInbound.id },
                'Inbox telegram notify queue not found during manual reclassification',
              );
            }
          } catch (err) {
            app.log.warn(
              { err, conversationId, messageId: latestInbound.id },
              'Failed to queue inbox Telegram notification after manual reclassification',
            );
          }
        } else {
          app.log.warn(
            { conversationId },
            'Skipping inbox Telegram notification on manual reclassification: inbound message not found',
          );
        }
      }
    }

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

  server.post('/:id/drafts/:draftId/approve', {
    schema: {
      tags: ['Inbox'],
      summary: 'Approve an AI draft and send via SMTP',
      params: draftActionParamsSchema,
      body: approveDraftBodySchema,
    },
  }, async (request) => {
    const { id, draftId } = request.params as { id: string; draftId: string };
    const body = (request.body ?? {}) as { content?: string } | null;
    const result = await approveDraft(app.prisma, app, id, draftId, body?.content, request.user?.sub);
    return { data: result };
  });

  server.post('/:id/drafts/:draftId/reject', {
    schema: {
      tags: ['Inbox'],
      summary: 'Reject an AI draft',
      params: draftActionParamsSchema,
    },
  }, async (request) => {
    const { id, draftId } = request.params as { id: string; draftId: string };
    const draft = await rejectDraft(app.prisma, id, draftId, request.user?.sub);
    return { data: draft };
  });

  server.post('/:id/drafts/:draftId/regenerate', {
    schema: {
      tags: ['Inbox'],
      summary: 'Regenerate an AI draft (replaces old with new)',
      params: draftActionParamsSchema,
    },
  }, async (request) => {
    const { id, draftId } = request.params as { id: string; draftId: string };
    const result = await regenerateDraft(app.prisma, app, id, draftId, request.user?.sub);
    return { data: result };
  });

  server.post('/:id/drafts/generate', {
    schema: {
      tags: ['Inbox'],
      summary: 'Trigger AI draft generation for the latest inbound message',
      params: generateDraftParamsSchema,
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await generateDraftForConversation(app.prisma, app, id, request.user?.sub);
    return reply.code(202).send({ data: result });
  });

  server.get('/:id/messages/:messageId/attachments/:attachmentId', {
    schema: {
      tags: ['Inbox'],
      summary: 'Get attachment binary data',
      params: attachmentParamsSchema,
    },
  }, async (request, reply) => {
    const { id, messageId, attachmentId } = request.params as {
      id: string;
      messageId: string;
      attachmentId: string;
    };

    // Verify the attachment belongs to the conversation
    const attachment = await app.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        messageId,
        message: { conversationId: id },
      },
    });

    if (!attachment) {
      throw new NotFoundError('Attachment', attachmentId);
    }

    return reply
      .type(attachment.contentType)
      .header('Content-Disposition', `inline; filename="${attachment.filename}"`)
      .send(Buffer.from(attachment.data));
  });
}
