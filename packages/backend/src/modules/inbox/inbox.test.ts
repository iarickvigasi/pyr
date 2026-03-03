import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, cleanDatabase, getAuthToken, prisma } from '../../test/setup.js';
import type { ChatEvent } from '../../services/gateway/types.js';
import type { GatewayWsClient } from '../../services/gateway/gateway-ws-client.js';
import {
  createTestGuest,
  createTestConversation,
  addTestMessage,
  createTestRoomType,
  createTestRoom,
} from '../../test/factories.js';

describe('Inbox API', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await getTestApp();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await cleanDatabase();
    token = await getAuthToken(app);
  });

  const headers = () => ({ authorization: `Bearer ${token}` });

  function setGatewayMock(gateway: Partial<GatewayWsClient>): void {
    (app as unknown as { gateway: GatewayWsClient }).gateway = gateway as GatewayWsClient;
  }

  function mockGatewayFinalJson(jsonPayload: unknown): void {
    const listeners: Array<(event: ChatEvent) => void> = [];
    setGatewayMock({
      get isConnected() {
        return true;
      },
      onChatEvent: (handler: (event: ChatEvent) => void) => {
        listeners.push(handler);
        return () => {};
      },
      request: vi.fn().mockImplementation(async (_method: string, params: unknown) => {
        const sessionKey = (params as { sessionKey: string }).sessionKey;
        const event: ChatEvent = {
          runId: 'run-1',
          sessionKey: `agent:main:${sessionKey}`,
          seq: 1,
          state: 'final',
          message: {
            content: JSON.stringify(jsonPayload),
            snapshot: true,
          },
        };
        for (const listener of listeners) {
          listener(event);
        }
        return { ok: true };
      }),
    });
  }

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

  describe('Customer suggestion workflow', () => {
    it('should suggest creating a guest when no existing match is found', async () => {
      const conv = await prisma.conversation.create({
        data: {
          channel: 'email',
          classification: 'conversation',
          subject: 'New inquiry',
        },
      });
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          direction: 'in',
          content: 'Hello, I would like to book.',
          channel: 'email',
          fromAddress: 'new-guest@example.com',
          fromName: 'New Guest',
          subject: 'New inquiry',
          sentAt: new Date(),
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/${conv.id}/customer-suggestion`,
        headers: headers(),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe('needs_create');
      expect(body.data.candidate.email).toBe('new-guest@example.com');
    });

    it('should suggest linking an existing guest when match is found', async () => {
      const guest = await createTestGuest(app, token, {
        name: 'Returning Guest',
        email: 'returning@example.com',
      });
      const conv = await prisma.conversation.create({
        data: {
          channel: 'email',
          classification: 'conversation',
          subject: 'Returning inquiry',
        },
      });
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          direction: 'in',
          content: 'I want to book again.',
          channel: 'email',
          fromAddress: 'returning@example.com',
          fromName: 'Returning Guest',
          subject: 'Returning inquiry',
          sentAt: new Date(),
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/${conv.id}/customer-suggestion`,
        headers: headers(),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe('matched_existing');
      expect(body.data.matchedGuest.id).toBe(guest.id);
    });

    it('should link conversation to an existing guest via API', async () => {
      const guest = await createTestGuest(app, token, { email: 'link-me@example.com' });
      const conv = await prisma.conversation.create({
        data: {
          channel: 'email',
          classification: 'conversation',
          subject: 'Needs link',
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conv.id}/link-guest`,
        headers: headers(),
        payload: { guestId: guest.id },
      });

      expect(res.statusCode).toBe(200);
      const updated = await prisma.conversation.findUnique({ where: { id: conv.id } });
      expect(updated?.guestId).toBe(guest.id);
    });

    it('should create and link a guest from inbound conversation data', async () => {
      const conv = await prisma.conversation.create({
        data: {
          channel: 'email',
          classification: 'conversation',
          subject: 'Create guest from email',
        },
      });
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          direction: 'in',
          content: 'Hallo, ich möchte ein Retreat buchen.',
          channel: 'email',
          fromAddress: 'create-me@example.com',
          fromName: 'Create Me',
          subject: 'Create guest from email',
          sentAt: new Date(),
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conv.id}/create-guest`,
        headers: headers(),
        payload: {},
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.guest.email).toBe('create-me@example.com');
      expect(body.data.conversation.guestId).toBe(body.data.guest.id);
    });
  });

  describe('Booking analysis workflow', () => {
    it('returns ready when OpenClaw provides complete booking dates', async () => {
      const conv = await prisma.conversation.create({
        data: {
          channel: 'email',
          classification: 'conversation',
          subject: 'Booking inquiry',
        },
      });
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          direction: 'in',
          content: 'Can I book from 2026-05-01 to 2026-05-05?',
          channel: 'email',
          fromAddress: 'guest@example.com',
          fromName: 'Guest Example',
          subject: 'Booking inquiry',
          sentAt: new Date(),
        },
      });

      mockGatewayFinalJson({
        bookingIntent: true,
        reason: 'Detected booking request with dates',
        confidence: 0.91,
        candidate: {
          checkIn: '2026-05-01',
          checkOut: '2026-05-05',
          totalPrice: 64000,
          currency: 'EUR',
          source: 'email',
          notes: '4 nights',
          guest: {
            name: 'Guest Example',
            email: 'guest@example.com',
            phone: null,
          },
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conv.id}/booking-analysis`,
        headers: headers(),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe('ready');
      expect(body.data.candidate.checkIn).toBe('2026-05-01');
      expect(body.data.candidate.checkOut).toBe('2026-05-05');
    });

    it('returns not_applicable when OpenClaw says no booking intent', async () => {
      const conv = await prisma.conversation.create({
        data: {
          channel: 'email',
          classification: 'conversation',
          subject: 'Thanks only',
        },
      });
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          direction: 'in',
          content: 'Thank you for your help yesterday.',
          channel: 'email',
          fromAddress: 'guest@example.com',
          fromName: 'Guest Example',
          subject: 'Thanks only',
          sentAt: new Date(),
        },
      });

      mockGatewayFinalJson({
        bookingIntent: false,
        reason: 'No reservation intent found',
        confidence: 0.88,
        candidate: null,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conv.id}/booking-analysis`,
        headers: headers(),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe('not_applicable');
      expect(body.data.candidate).toBeNull();
    });

    it('returns insufficient_data when booking intent exists but dates are missing', async () => {
      const conv = await prisma.conversation.create({
        data: {
          channel: 'email',
          classification: 'ota_tripaneer',
          subject: 'Booking signal',
        },
      });
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          direction: 'in',
          content: 'I want to book next month, no exact dates yet.',
          channel: 'email',
          fromAddress: 'guest@example.com',
          fromName: 'Guest Example',
          subject: 'Booking signal',
          sentAt: new Date(),
        },
      });

      mockGatewayFinalJson({
        bookingIntent: true,
        reason: 'Booking intent found, dates missing',
        confidence: 0.72,
        candidate: {
          checkIn: null,
          checkOut: null,
          totalPrice: null,
          currency: null,
          source: 'ota',
          notes: null,
          guest: {
            name: 'Guest Example',
            email: 'guest@example.com',
            phone: null,
          },
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conv.id}/booking-analysis`,
        headers: headers(),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe('insufficient_data');
      expect(body.data.missingFields).toEqual(expect.arrayContaining(['checkIn', 'checkOut']));
    });

    it('returns error status when gateway is unavailable', async () => {
      const conv = await prisma.conversation.create({
        data: {
          channel: 'email',
          classification: 'conversation',
          subject: 'Booking check',
        },
      });
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          direction: 'in',
          content: 'Can I book 3 nights?',
          channel: 'email',
          fromAddress: 'guest@example.com',
          fromName: 'Guest Example',
          subject: 'Booking check',
          sentAt: new Date(),
        },
      });

      setGatewayMock({
        isConnected: false,
        onChatEvent: () => () => {},
        request: vi.fn(),
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conv.id}/booking-analysis`,
        headers: headers(),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe('error');
      expect(typeof body.data.reason).toBe('string');
    });
  });

  describe('Create booking from conversation workflow', () => {
    it('creates booking with linked guest and links booking to conversation', async () => {
      const guest = await createTestGuest(app, token, {
        name: 'Linked Guest',
        email: 'linked@example.com',
      });
      const roomType = await createTestRoomType(app, token, {
        name: 'Inbox Booking Type',
        basePrice: 20000,
      });
      const room = await createTestRoom(app, token, roomType.id, {
        name: 'Inbox Room A',
      });
      const conv = await createTestConversation(app, token, guest.id, {
        subject: 'Linked booking flow',
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conv.id}/bookings`,
        headers: headers(),
        payload: {
          guest: { mode: 'linked' },
          booking: {
            roomId: room.id,
            checkIn: '2026-06-10',
            checkOut: '2026-06-14',
            totalPrice: 80000,
            status: 'inquiry',
            source: 'inbox-manual',
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.guest.id).toBe(guest.id);
      expect(body.data.booking.sourceConversationId).toBe(conv.id);
    });

    it('creates guest in wizard mode and then creates booking', async () => {
      const roomType = await createTestRoomType(app, token, {
        name: 'Inbox Wizard Type',
      });
      const room = await createTestRoom(app, token, roomType.id, {
        name: 'Inbox Room B',
      });

      const conv = await prisma.conversation.create({
        data: {
          channel: 'email',
          classification: 'conversation',
          subject: 'Need booking and customer',
        },
      });
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          direction: 'in',
          content: 'I want to book from 10 July to 14 July.',
          channel: 'email',
          fromAddress: 'new-inbox-guest@example.com',
          fromName: 'New Inbox Guest',
          subject: 'Need booking and customer',
          sentAt: new Date(),
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conv.id}/bookings`,
        headers: headers(),
        payload: {
          guest: {
            mode: 'create',
            name: 'New Inbox Guest',
            email: 'new-inbox-guest@example.com',
            language: 'en',
          },
          booking: {
            roomId: room.id,
            checkIn: '2026-07-10',
            checkOut: '2026-07-14',
            totalPrice: 78000,
            status: 'confirmed',
            source: 'inbox-wizard',
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.guest.email).toBe('new-inbox-guest@example.com');
      expect(body.data.conversation.guestId).toBe(body.data.guest.id);
      expect(body.data.booking.sourceConversationId).toBe(conv.id);
    });

    it('returns 409 when room overlaps existing booking', async () => {
      const guest = await createTestGuest(app, token, {
        email: 'overlap@example.com',
      });
      const roomType = await createTestRoomType(app, token, {
        name: 'Overlap Type',
      });
      const room = await createTestRoom(app, token, roomType.id, {
        name: 'Overlap Room',
      });
      const conv = await createTestConversation(app, token, guest.id, {
        subject: 'Overlap flow',
      });

      await app.inject({
        method: 'POST',
        url: '/api/v1/bookings',
        headers: headers(),
        payload: {
          guestIds: [guest.id],
          roomId: room.id,
          checkIn: '2026-08-01',
          checkOut: '2026-08-05',
          totalPrice: 90000,
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conv.id}/bookings`,
        headers: headers(),
        payload: {
          guest: { mode: 'linked' },
          booking: {
            roomId: room.id,
            checkIn: '2026-08-03',
            checkOut: '2026-08-06',
            totalPrice: 50000,
          },
        },
      });

      expect(res.statusCode).toBe(409);
    });

    it('includes linked booking in conversation detail after inbox booking creation', async () => {
      const guest = await createTestGuest(app, token, {
        email: 'detail-link@example.com',
      });
      const roomType = await createTestRoomType(app, token, {
        name: 'Detail Link Type',
      });
      const room = await createTestRoom(app, token, roomType.id, {
        name: 'Detail Link Room',
      });
      const conv = await createTestConversation(app, token, guest.id, {
        subject: 'Conversation detail booking link',
      });

      const createRes = await app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conv.id}/bookings`,
        headers: headers(),
        payload: {
          guest: { mode: 'linked' },
          booking: {
            roomId: room.id,
            checkIn: '2026-09-10',
            checkOut: '2026-09-14',
            totalPrice: 85000,
          },
        },
      });
      expect(createRes.statusCode).toBe(201);
      const createBody = JSON.parse(createRes.body);
      const bookingId = createBody.data.booking.id as string;

      const detailRes = await app.inject({
        method: 'GET',
        url: `/api/v1/conversations/${conv.id}`,
        headers: headers(),
      });

      expect(detailRes.statusCode).toBe(200);
      const detailBody = JSON.parse(detailRes.body);
      expect(detailBody.data.bookings.map((b: { id: string }) => b.id)).toContain(bookingId);
    });
  });
});
