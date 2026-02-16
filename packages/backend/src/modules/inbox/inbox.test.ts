import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, cleanDatabase, getAuthToken, prisma } from '../../test/setup.js';
import { createTestGuest, createTestConversation, addTestMessage } from '../../test/factories.js';

describe('Inbox API', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await getTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    token = await getAuthToken(app);
  });

  const headers = () => ({ authorization: `Bearer ${token}` });

  describe('POST /api/v1/conversations', () => {
    it('should create a conversation', async () => {
      const guest = await createTestGuest(app, token);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations',
        headers: headers(),
        payload: { guestId: guest.id, channel: 'email', subject: 'Test inquiry' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.guestId).toBe(guest.id);
      expect(body.data.channel).toBe('email');
      expect(body.data.subject).toBe('Test inquiry');
      expect(body.data.status).toBe('open');
    });

    it('should return 404 for non-existent guest', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations',
        headers: headers(),
        payload: { guestId: 'nonexistent', channel: 'email' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 404 for soft-deleted guest', async () => {
      const guest = await createTestGuest(app, token);

      // Soft-delete the guest
      await app.inject({
        method: 'DELETE',
        url: `/api/v1/guests/${guest.id}`,
        headers: headers(),
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations',
        headers: headers(),
        payload: { guestId: guest.id, channel: 'email' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should create audit log entry', async () => {
      const guest = await createTestGuest(app, token);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations',
        headers: headers(),
        payload: { guestId: guest.id, channel: 'email' },
      });

      const body = JSON.parse(res.body);
      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'conversation', entityId: body.data.id, action: 'create' },
      });
      expect(logs).toHaveLength(1);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations',
        payload: { guestId: 'x', channel: 'email' },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/conversations', () => {
    it('should return paginated conversations', async () => {
      const guest = await createTestGuest(app, token);
      await createTestConversation(app, token, guest.id, { subject: 'Conv 1' });
      await createTestConversation(app, token, guest.id, { subject: 'Conv 2' });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/conversations',
        headers: headers(),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(2);
      expect(body.hasMore).toBe(false);
    });

    it('should filter by status', async () => {
      const guest = await createTestGuest(app, token);
      const conv = await createTestConversation(app, token, guest.id);
      await createTestConversation(app, token, guest.id);

      // Close one conversation
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/conversations/${conv.id}`,
        headers: headers(),
        payload: { status: 'closed' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/conversations?status=open',
        headers: headers(),
      });

      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
    });

    it('should filter by guestId', async () => {
      const guest1 = await createTestGuest(app, token, { name: 'Guest A' });
      const guest2 = await createTestGuest(app, token, { name: 'Guest B' });
      await createTestConversation(app, token, guest1.id);
      await createTestConversation(app, token, guest2.id);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations?guestId=${guest1.id}`,
        headers: headers(),
      });

      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
    });

    it('should order by lastMessageAt descending', async () => {
      const guest = await createTestGuest(app, token);
      const conv1 = await createTestConversation(app, token, guest.id, { subject: 'Older' });
      const conv2 = await createTestConversation(app, token, guest.id, { subject: 'Newer' });

      // Add message to conv1 with an older timestamp
      await addTestMessage(app, token, conv1.id, {
        sentAt: '2026-01-01T10:00:00Z',
      });
      // Add message to conv2 with a newer timestamp
      await addTestMessage(app, token, conv2.id, {
        sentAt: '2026-02-01T10:00:00Z',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/conversations',
        headers: headers(),
      });

      const body = JSON.parse(res.body);
      expect(body.data[0].subject).toBe('Newer');
      expect(body.data[1].subject).toBe('Older');
    });
  });

  describe('GET /api/v1/conversations/:id', () => {
    it('should return conversation with messages in ascending order', async () => {
      const guest = await createTestGuest(app, token);
      const conv = await createTestConversation(app, token, guest.id);

      await addTestMessage(app, token, conv.id, {
        content: 'First message',
        sentAt: '2026-01-01T10:00:00Z',
      });
      await addTestMessage(app, token, conv.id, {
        content: 'Second message',
        direction: 'out',
        sentAt: '2026-01-01T11:00:00Z',
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/${conv.id}`,
        headers: headers(),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.messages).toHaveLength(2);
      expect(body.data.messages[0].content).toBe('First message');
      expect(body.data.messages[1].content).toBe('Second message');
    });

    it('should include guest details', async () => {
      const guest = await createTestGuest(app, token, { name: 'Alice', email: 'alice@test.com', language: 'de' });
      const conv = await createTestConversation(app, token, guest.id);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/${conv.id}`,
        headers: headers(),
      });

      const body = JSON.parse(res.body);
      expect(body.data.guest.name).toBe('Alice');
      expect(body.data.guest.email).toBe('alice@test.com');
      expect(body.data.guest.language).toBe('de');
    });

    it('should return 404 for non-existent conversation', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/conversations/nonexistent',
        headers: headers(),
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v1/conversations/:id', () => {
    it('should close a conversation', async () => {
      const conv = await createTestConversation(app, token);

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/conversations/${conv.id}`,
        headers: headers(),
        payload: { status: 'closed' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe('closed');
    });

    it('should reopen a conversation', async () => {
      const conv = await createTestConversation(app, token);

      // Close first
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/conversations/${conv.id}`,
        headers: headers(),
        payload: { status: 'closed' },
      });

      // Reopen
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/conversations/${conv.id}`,
        headers: headers(),
        payload: { status: 'open' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.status).toBe('open');
    });

    it('should create audit log on status change', async () => {
      const conv = await createTestConversation(app, token);

      await app.inject({
        method: 'PATCH',
        url: `/api/v1/conversations/${conv.id}`,
        headers: headers(),
        payload: { status: 'closed' },
      });

      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'conversation', entityId: conv.id, action: 'update' },
      });
      expect(logs).toHaveLength(1);
      expect((logs[0]!.changes as Record<string, unknown>).status).toEqual({
        from: 'open',
        to: 'closed',
      });
    });
  });

  describe('POST /api/v1/conversations/:id/messages', () => {
    it('should add an inbound message', async () => {
      const conv = await createTestConversation(app, token);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conv.id}/messages`,
        headers: headers(),
        payload: { direction: 'in', content: 'Hello!', channel: 'email' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.direction).toBe('in');
      expect(body.data.content).toBe('Hello!');
    });

    it('should add an outbound message', async () => {
      const conv = await createTestConversation(app, token);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conv.id}/messages`,
        headers: headers(),
        payload: { direction: 'out', content: 'Hi there!', channel: 'email' },
      });

      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).data.direction).toBe('out');
    });

    it('should update lastMessageAt on conversation', async () => {
      const conv = await createTestConversation(app, token);

      const sentAt = '2026-03-15T14:30:00.000Z';
      await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conv.id}/messages`,
        headers: headers(),
        payload: { direction: 'in', content: 'Hello', channel: 'email', sentAt },
      });

      const updated = await prisma.conversation.findUnique({ where: { id: conv.id } });
      expect(updated!.lastMessageAt!.toISOString()).toBe(sentAt);
    });

    it('should store email threading headers', async () => {
      const conv = await createTestConversation(app, token);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conv.id}/messages`,
        headers: headers(),
        payload: {
          direction: 'in',
          content: 'Hello',
          channel: 'email',
          messageId: '<msg-123@example.com>',
          inReplyTo: '<msg-100@example.com>',
          references: '<msg-100@example.com> <msg-50@example.com>',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.messageId).toBe('<msg-123@example.com>');
      expect(body.data.inReplyTo).toBe('<msg-100@example.com>');
      expect(body.data.references).toBe('<msg-100@example.com> <msg-50@example.com>');
    });

    it('should return 404 for non-existent conversation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations/nonexistent/messages',
        headers: headers(),
        payload: { direction: 'in', content: 'Hello', channel: 'email' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/conversations/:id/drafts', () => {
    it('should return empty array when no drafts exist', async () => {
      const conv = await createTestConversation(app, token);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/${conv.id}/drafts`,
        headers: headers(),
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data).toEqual([]);
    });

    it('should return drafts ordered by createdAt descending', async () => {
      const conv = await createTestConversation(app, token);

      // Seed drafts directly via Prisma
      await prisma.aiDraft.createMany({
        data: [
          {
            conversationId: conv.id,
            content: 'Draft 1',
            model: 'claude-sonnet',
            tokensUsed: 100,
            createdAt: new Date('2026-01-01'),
          },
          {
            conversationId: conv.id,
            content: 'Draft 2',
            model: 'claude-sonnet',
            tokensUsed: 150,
            createdAt: new Date('2026-01-02'),
          },
        ],
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/${conv.id}/drafts`,
        headers: headers(),
      });

      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(2);
      // Newest first
      expect(body.data[0].content).toBe('Draft 2');
      expect(body.data[1].content).toBe('Draft 1');
    });

    it('should return 404 for non-existent conversation', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/conversations/nonexistent/drafts',
        headers: headers(),
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
