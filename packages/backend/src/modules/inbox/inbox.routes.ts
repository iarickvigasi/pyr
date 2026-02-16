import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ConversationStatus } from '@prisma/client';
import { idParamSchema } from '@pyr/shared';
import {
  createConversationSchema,
  updateConversationSchema,
  listConversationsQuerySchema,
  addMessageSchema,
} from './inbox.schema.js';
import {
  listConversations,
  getConversation,
  createConversation,
  updateConversationStatus,
  listDrafts,
} from './conversation.service.js';
import { addMessage } from './message.service.js';

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
    schema: { tags: ['Inbox'], summary: 'Update conversation status (open/closed)', params: idParamSchema, body: updateConversationSchema },
  }, async (request) => {
    const conversation = await updateConversationStatus(
      app.prisma,
      request.params.id,
      request.body.status as ConversationStatus,
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

  server.get('/:id/drafts', {
    schema: { tags: ['Inbox'], summary: 'List AI drafts for a conversation', params: idParamSchema },
  }, async (request) => {
    return { data: await listDrafts(app.prisma, request.params.id) };
  });
}
