import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMailMock = vi.fn().mockResolvedValue({ messageId: '<msg-1@example.com>' });
const verifyMock = vi.fn().mockResolvedValue(true);

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: sendMailMock,
      verify: verifyMock,
    })),
  },
}));

import { createSmtpService } from '../smtp.service.js';

function makeLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
  };
}

describe('smtp.service formatting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves plain text line breaks and spaces when sending', async () => {
    const smtp = createSmtpService({
      host: 'smtp.example.com',
      port: 587,
      user: 'ines@example.com',
      pass: 'secret',
    }, makeLogger() as never);

    await smtp.sendNew({
      to: 'guest@example.com',
      subject: 'Test',
      html: 'Line 1\n\n  Line 2',
    }, 'Best regards,\nInes');

    const payload = sendMailMock.mock.calls[0]?.[0];
    expect(payload.html).toContain('white-space: pre-wrap;');
    expect(payload.html).toContain('Line 1');
    expect(payload.html).toContain('  Line 2');
    expect(payload.html).toContain('Best regards');
    expect(payload.html).toContain('Ines');
  });

  it('keeps provided HTML content unchanged (does not escape tags)', async () => {
    const smtp = createSmtpService({
      host: 'smtp.example.com',
      port: 587,
      user: 'ines@example.com',
      pass: 'secret',
    }, makeLogger() as never);

    await smtp.sendReply({
      to: 'guest@example.com',
      subject: 'Re: Test',
      html: '<p><strong>Hello</strong> guest</p>',
      inReplyTo: '<inbound@example.com>',
      references: ['<inbound@example.com>'],
    }, '<p>Kind regards,<br/>Ines</p>');

    const payload = sendMailMock.mock.calls[0]?.[0];
    expect(payload.html).toContain('<strong>Hello</strong>');
    expect(payload.html).toContain('<p>Kind regards,<br/>Ines</p>');
  });
});
