import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { InboxTelegramNotifyJobData } from '@pyr/shared';

import { createInboxTelegramNotifyProcessor } from '../inbox-telegram-notify.job.js';

function createMockApp(message: Record<string, unknown> | null) {
  const childLogger = {
    info: vi.fn(),
    warn: vi.fn(),
  };
  return {
    prisma: {
      message: {
        findFirst: vi.fn().mockResolvedValue(message),
      },
    },
    config: {
      CORS_ORIGIN: 'http://localhost:3000',
    },
    gateway: {
      request: vi.fn().mockResolvedValue({ ok: true }),
    },
    log: {
      child: vi.fn().mockReturnValue(childLogger),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

describe('inbox telegram notify job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NOTIFY_TELEGRAM_ENABLED = 'true';
    process.env.NOTIFY_TELEGRAM_OWNER_USER_ID = '130414078';
    process.env.NOTIFY_INBOX_SCOPE = 'conversation,ota';
  });

  it('sends structured inbox_email_alert_v1 notification payload', async () => {
    const app = createMockApp({
      id: 'msg-1',
      fromAddress: 'anna@example.com',
      fromName: 'Anna',
      subject: 'Retreat inquiry',
      content: 'Hello there.\n\nI want to book for March 10 to March 15.',
      sentAt: new Date('2026-03-05T10:00:00Z'),
      classification: 'conversation',
    });

    const processor = createInboxTelegramNotifyProcessor(app as never);
    const job = {
      id: 'job-1',
      data: {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        classification: 'conversation',
      } satisfies InboxTelegramNotifyJobData,
    };

    await processor(job as Job<InboxTelegramNotifyJobData>);

    expect((app as { gateway: { request: ReturnType<typeof vi.fn> } }).gateway.request).toHaveBeenCalledWith(
      'agent',
      expect.objectContaining({
        deliver: true,
        sessionKey: 'agent:main:telegram:direct:130414078',
        replyChannel: 'telegram',
        replyTo: '130414078',
      }),
    );
    const gatewayCall = (app as { gateway: { request: ReturnType<typeof vi.fn> } }).gateway.request.mock.calls[0]!;
    const payload = gatewayCall[1] as { message: string };
    expect(payload.message).toContain('kind=inbox_email_alert_v1');
    expect(payload.message).toContain('conversationId=conv-1');
    expect(payload.message).toContain('sender=Anna <anna@example.com>');
    expect(payload.message).toContain('subject=Retreat inquiry');
    expect(payload.message).toContain('classification=conversation');
    expect(payload.message).toContain('receivedAt=2026-03-05T10:00:00.000Z');
    expect(payload.message).toContain('snippet=Hello there. I want to book for March 10 to March 15.');
    expect(payload.message).toContain('conversationLink=not_available');
    expect(payload.message).toContain('conversationOpenMode=manual_only');
  });

  it('skips notification when message row no longer exists', async () => {
    const app = createMockApp(null);
    const processor = createInboxTelegramNotifyProcessor(app as never);
    const job = {
      id: 'job-2',
      data: {
        conversationId: 'conv-2',
        messageId: 'missing-msg',
        classification: 'ota_other',
      } satisfies InboxTelegramNotifyJobData,
    };

    await processor(job as Job<InboxTelegramNotifyJobData>);

    expect((app as { gateway: { request: ReturnType<typeof vi.fn> } }).gateway.request).not.toHaveBeenCalled();
  });

  it('prefers job classification override when message classification is stale', async () => {
    const app = createMockApp({
      id: 'msg-3',
      fromAddress: 'guest@example.com',
      fromName: 'Guest',
      subject: 'Reclassified thread',
      content: 'Please help me with booking details.',
      sentAt: new Date('2026-03-05T11:00:00Z'),
      classification: 'other',
    });

    const processor = createInboxTelegramNotifyProcessor(app as never);
    const job = {
      id: 'job-3',
      data: {
        conversationId: 'conv-3',
        messageId: 'msg-3',
        classification: 'conversation',
      } satisfies InboxTelegramNotifyJobData,
    };

    await processor(job as Job<InboxTelegramNotifyJobData>);

    const gatewayCall = (app as { gateway: { request: ReturnType<typeof vi.fn> } }).gateway.request.mock.calls[0]!;
    const payload = gatewayCall[1] as { message: string };
    expect(payload.message).toContain('classification=conversation');
  });
});
