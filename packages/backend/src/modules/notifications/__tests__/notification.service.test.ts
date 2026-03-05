import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../settings/settings.service.js', () => ({
  getSetting: vi.fn(),
}));

import { getSetting } from '../../settings/settings.service.js';
import {
  formatAlert,
  resolveTelegramNotificationConfig,
  sendInboxEmailNotification,
  sendViaGateway,
  shouldNotifyInboxTelegramForClassification,
} from '../notification.service.js';

const mockedGetSetting = vi.mocked(getSetting);

function createMockApp() {
  return {
    prisma: {},
    gateway: {
      request: vi.fn().mockResolvedValue({ ok: true }),
    },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    },
  } as unknown as Parameters<typeof sendViaGateway>[0];
}

describe('notification service telegram routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSetting.mockRejectedValue(new Error('not found'));
    process.env.NOTIFY_INBOX_SCOPE = 'conversation,ota';
    process.env.NOTIFY_TELEGRAM_ENABLED = 'true';
    process.env.NOTIFY_TELEGRAM_OWNER_USER_ID = '130414078';
  });

  it('sends gateway agent request with explicit telegram target routing and owner DM session key', async () => {
    const app = createMockApp();
    await resolveTelegramNotificationConfig(app, { forceRefresh: true });

    await sendViaGateway(app, 'alert', 'test message');

    expect(app.gateway.request).toHaveBeenCalledWith(
      'agent',
      expect.objectContaining({
        deliver: true,
        sessionKey: 'agent:main:telegram:direct:130414078',
        replyChannel: 'telegram',
        replyTo: '130414078',
      }),
    );
  });

  it('keeps non-deliver draft route on hook:draft session key', async () => {
    const app = createMockApp();
    await resolveTelegramNotificationConfig(app, { forceRefresh: true });

    await sendViaGateway(app, 'draft', 'draft preview message');

    expect(app.gateway.request).toHaveBeenCalledWith(
      'agent',
      expect.objectContaining({
        deliver: false,
        sessionKey: expect.stringMatching(/^hook:draft:\d+$/),
      }),
    );
  });

  it('skips delivery when owner user id is missing', async () => {
    const app = createMockApp();
    process.env.NOTIFY_TELEGRAM_OWNER_USER_ID = '';
    await resolveTelegramNotificationConfig(app, { forceRefresh: true });

    await sendViaGateway(app, 'alert', 'test message');

    expect(app.gateway.request).not.toHaveBeenCalled();
    expect(app.log.warn).toHaveBeenCalled();
  });

  it('respects notification scope filter for inbox classifications', async () => {
    const app = createMockApp();
    process.env.NOTIFY_INBOX_SCOPE = 'conversation';
    await resolveTelegramNotificationConfig(app, { forceRefresh: true });

    await expect(
      shouldNotifyInboxTelegramForClassification(app, 'conversation'),
    ).resolves.toBe(true);
    await expect(
      shouldNotifyInboxTelegramForClassification(app, 'ota_other'),
    ).resolves.toBe(false);
    await expect(
      shouldNotifyInboxTelegramForClassification(app, 'other'),
    ).resolves.toBe(false);
  });

  it('formats inbox email notification payload as inbox_email_alert_v1 with required fields', async () => {
    const app = createMockApp();
    await resolveTelegramNotificationConfig(app, { forceRefresh: true });

    await sendInboxEmailNotification(app, {
      conversationId: 'conv_123',
      classification: 'conversation',
      sender: 'Anna <anna@example.com>',
      subject: 'Rates request',
      receivedAt: '2026-03-05T12:30:00.000Z',
      snippet: 'Hi, do you have room for 2 people?',
    });

    expect(app.gateway.request).toHaveBeenCalledWith(
      'agent',
      expect.objectContaining({
        message: expect.stringContaining('kind=inbox_email_alert_v1'),
      }),
    );

    const call = vi.mocked(app.gateway.request).mock.calls[0];
    const params = call?.[1] as { message: string };
    expect(params.message).toContain('conversationId=conv_123');
    expect(params.message).toContain('sender=Anna <anna@example.com>');
    expect(params.message).toContain('subject=Rates request');
    expect(params.message).toContain('classification=conversation');
    expect(params.message).toContain('receivedAt=2026-03-05T12:30:00.000Z');
    expect(params.message).toContain('snippet=Hi, do you have room for 2 people?');
    expect(params.message).toContain('conversationLink=not_available');
    expect(params.message).toContain('conversationOpenMode=manual_only');
  });

  it('uses non-ambiguous draft-ready copy without generic Reply Show instruction', () => {
    const message = formatAlert('draft-ready', { guestName: 'Anna' });
    expect(message).not.toContain("Reply 'Show'");
    expect(message).toContain('show latest draft for Anna');
  });
});
