import { describe, it, expect } from 'vitest';
import { parseEmail, sanitizeEmailHtml } from '../email-parser.js';

// ─── Helpers ────────────────────────────────────────────────

function buildMime(headers: Record<string, string>, body: string, contentType = 'text/plain'): Buffer {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    lines.push(`${key}: ${value}`);
  }
  if (!headers['Content-Type']) {
    lines.push(`Content-Type: ${contentType}`);
  }
  lines.push('');
  lines.push(body);
  return Buffer.from(lines.join('\r\n'));
}

// ─── parseEmail ─────────────────────────────────────────────

describe('parseEmail', () => {
  it('parses a simple plain-text email', async () => {
    const source = buildMime(
      {
        From: 'Test User <test@example.com>',
        To: 'info@pyr.com',
        Subject: 'Hello',
        'Message-ID': '<abc123@example.com>',
        Date: 'Wed, 19 Feb 2026 10:00:00 +0000',
      },
      'Hello, I would like to book a retreat.',
    );

    const result = await parseEmail(source);

    expect(result.messageId).toBe('<abc123@example.com>');
    expect(result.from).toEqual({ name: 'Test User', address: 'test@example.com' });
    expect(result.to).toEqual([{ name: '', address: 'info@pyr.com' }]);
    expect(result.subject).toBe('Hello');
    expect(result.text).toContain('Hello, I would like to book a retreat.');
    expect(result.date).toBeInstanceOf(Date);
    expect(result.rawSource).toEqual(source);
  });

  it('parses an HTML email — extracts sanitized htmlContent and text separately', async () => {
    const htmlBody = '<html><body><h1>Welcome</h1><p>Book <b>now</b>!</p></body></html>';
    const source = buildMime(
      {
        From: 'Sender <sender@example.com>',
        To: 'info@pyr.com',
        Subject: 'HTML Email',
        'Message-ID': '<html001@example.com>',
        Date: 'Wed, 19 Feb 2026 12:00:00 +0000',
        'Content-Type': 'text/html',
      },
      htmlBody,
    );

    const result = await parseEmail(source);

    expect(result.html).toContain('<h1>');
    expect(result.html).toContain('<b>now</b>');
    // Should NOT contain script tags or other dangerous content
    expect(result.html).not.toContain('<script');
    expect(result.subject).toBe('HTML Email');
  });

  it('parses email with In-Reply-To and References headers', async () => {
    const source = buildMime(
      {
        From: 'Reply User <reply@example.com>',
        To: 'info@pyr.com',
        Subject: 'Re: Booking Inquiry',
        'Message-ID': '<reply001@example.com>',
        'In-Reply-To': '<orig001@example.com>',
        References: '<orig001@example.com> <mid002@example.com>',
        Date: 'Wed, 19 Feb 2026 14:00:00 +0000',
      },
      'Thanks for the reply!',
    );

    const result = await parseEmail(source);

    expect(result.inReplyTo).toBe('<orig001@example.com>');
    expect(result.references).toEqual(['<orig001@example.com>', '<mid002@example.com>']);
  });

  it('normalizes References from single string to array', async () => {
    const source = buildMime(
      {
        From: 'Test <test@example.com>',
        To: 'info@pyr.com',
        Subject: 'Re: Test',
        'Message-ID': '<norm001@example.com>',
        References: '<single@example.com>',
        Date: 'Wed, 19 Feb 2026 15:00:00 +0000',
      },
      'Body',
    );

    const result = await parseEmail(source);

    expect(result.references).toEqual(['<single@example.com>']);
    expect(Array.isArray(result.references)).toBe(true);
  });

  it('defaults subject to "(no subject)" when missing', async () => {
    const source = Buffer.from(
      'From: Test <test@example.com>\r\n' +
      'To: info@pyr.com\r\n' +
      'Message-ID: <nosub001@example.com>\r\n' +
      'Date: Wed, 19 Feb 2026 10:00:00 +0000\r\n' +
      'Content-Type: text/plain\r\n' +
      '\r\n' +
      'No subject email body.\r\n',
    );

    const result = await parseEmail(source);

    expect(result.subject).toBe('(no subject)');
  });

  it('returns empty string for messageId when header is missing', async () => {
    const source = Buffer.from(
      'From: Test <test@example.com>\r\n' +
      'To: info@pyr.com\r\n' +
      'Subject: No Message-ID\r\n' +
      'Date: Wed, 19 Feb 2026 10:00:00 +0000\r\n' +
      'Content-Type: text/plain\r\n' +
      '\r\n' +
      'Body without message ID.\r\n',
    );

    const result = await parseEmail(source);

    expect(result.messageId).toBe('');
  });

  it('strips malicious HTML — script tags, iframes, onclick handlers', async () => {
    const maliciousHtml =
      '<p>Hello</p>' +
      '<script>alert("xss")</script>' +
      '<iframe src="evil.com"></iframe>' +
      '<div onclick="steal()">Click me</div>';

    const source = buildMime(
      {
        From: 'Evil <evil@example.com>',
        To: 'info@pyr.com',
        Subject: 'XSS Attempt',
        'Message-ID': '<xss001@example.com>',
        Date: 'Wed, 19 Feb 2026 10:00:00 +0000',
        'Content-Type': 'text/html',
      },
      maliciousHtml,
    );

    const result = await parseEmail(source);

    expect(result.html).toContain('<p>Hello</p>');
    expect(result.html).not.toContain('<script');
    expect(result.html).not.toContain('<iframe');
    expect(result.html).not.toContain('onclick');
  });

  it('preserves allowed HTML tags — b, i, a, p, br, ul, ol, li, table, img', async () => {
    const allowedHtml =
      '<p>Text with <b>bold</b> and <i>italic</i></p>' +
      '<a href="https://example.com">Link</a>' +
      '<br>' +
      '<ul><li>Item 1</li></ul>' +
      '<ol><li>Item 2</li></ol>' +
      '<table><tr><td>Cell</td></tr></table>' +
      '<img src="https://example.com/photo.jpg" alt="Photo">';

    const source = buildMime(
      {
        From: 'Safe <safe@example.com>',
        To: 'info@pyr.com',
        Subject: 'Safe HTML',
        'Message-ID': '<safe001@example.com>',
        Date: 'Wed, 19 Feb 2026 10:00:00 +0000',
        'Content-Type': 'text/html',
      },
      allowedHtml,
    );

    const result = await parseEmail(source);

    expect(result.html).toContain('<b>bold</b>');
    expect(result.html).toContain('<i>italic</i>');
    expect(result.html).toContain('<a href="https://example.com"');
    expect(result.html).toContain('<ul>');
    expect(result.html).toContain('<li>Item 1</li>');
    expect(result.html).toContain('<ol>');
    expect(result.html).toContain('<table>');
    expect(result.html).toContain('<img src="https://example.com/photo.jpg"');
  });

  it('strips dangerous src schemes from img tags', async () => {
    const dangerousImg =
      '<img src="javascript:alert(1)">' +
      '<img src="data:text/html,<script>alert(1)</script>">' +
      '<img src="https://safe.com/pixel.gif">';

    const source = buildMime(
      {
        From: 'Tracker <tracker@example.com>',
        To: 'info@pyr.com',
        Subject: 'Tracking Test',
        'Message-ID': '<track001@example.com>',
        Date: 'Wed, 19 Feb 2026 10:00:00 +0000',
        'Content-Type': 'text/html',
      },
      dangerousImg,
    );

    const result = await parseEmail(source);

    expect(result.html).not.toContain('javascript:');
    expect(result.html).not.toContain('data:');
    expect(result.html).toContain('https://safe.com/pixel.gif');
  });
});

// ─── sanitizeEmailHtml ──────────────────────────────────────

describe('sanitizeEmailHtml', () => {
  it('strips <script> tags entirely', () => {
    const result = sanitizeEmailHtml('<p>Hello</p><script>alert("xss")</script>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
    expect(result).toContain('<p>Hello</p>');
  });

  it('strips <iframe> tags entirely', () => {
    const result = sanitizeEmailHtml('<p>Content</p><iframe src="evil.com"></iframe>');
    expect(result).not.toContain('<iframe');
    expect(result).toContain('<p>Content</p>');
  });

  it('strips <style> blocks', () => {
    const result = sanitizeEmailHtml('<style>body { color: red; }</style><p>Styled</p>');
    expect(result).not.toContain('<style');
    expect(result).not.toContain('color: red');
    expect(result).toContain('<p>Styled</p>');
  });

  it('strips event handlers (onclick, onload, onerror)', () => {
    const result = sanitizeEmailHtml(
      '<div onclick="steal()">Click</div>' +
      '<img onload="track()" src="https://example.com/img.jpg">' +
      '<body onerror="hack()">',
    );
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('onload');
    expect(result).not.toContain('onerror');
  });

  it('preserves basic formatting tags', () => {
    const html = '<b>Bold</b> <i>Italic</i> <em>Emphasis</em> <strong>Strong</strong> <a href="https://example.com">Link</a> <p>Paragraph</p><br>';
    const result = sanitizeEmailHtml(html);
    expect(result).toContain('<b>Bold</b>');
    expect(result).toContain('<i>Italic</i>');
    expect(result).toContain('<em>Emphasis</em>');
    expect(result).toContain('<strong>Strong</strong>');
    expect(result).toContain('<a href="https://example.com"');
    expect(result).toContain('<p>Paragraph</p>');
    expect(result).toContain('<br');
  });

  it('preserves table structure tags', () => {
    const html = '<table><tr><td>Cell 1</td><th>Header</th></tr></table>';
    const result = sanitizeEmailHtml(html);
    expect(result).toContain('<table>');
    expect(result).toContain('<tr>');
    expect(result).toContain('<td>Cell 1</td>');
    expect(result).toContain('<th>Header</th>');
  });

  it('allows href on anchors but strips javascript: scheme URLs', () => {
    const html =
      '<a href="https://pyr.com">Safe</a>' +
      '<a href="javascript:alert(1)">Evil</a>' +
      '<a href="mailto:info@pyr.com">Email</a>';
    const result = sanitizeEmailHtml(html);
    expect(result).toContain('href="https://pyr.com"');
    expect(result).not.toContain('javascript:');
    expect(result).toContain('href="mailto:info@pyr.com"');
  });
});
