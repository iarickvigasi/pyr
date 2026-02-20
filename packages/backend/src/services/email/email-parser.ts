import { simpleParser } from 'mailparser';
import sanitizeHtml from 'sanitize-html';

// ─── Types ──────────────────────────────────────────────────

export interface ParsedEmail {
  messageId: string;
  inReplyTo: string | undefined;
  references: string[];
  from: { name: string; address: string };
  to: { name: string; address: string }[];
  subject: string;
  text: string;
  html: string;
  date: Date;
  rawSource: Buffer;
}

// ─── Sanitization config ────────────────────────────────────

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'b', 'i', 'em', 'strong', 'a', 'p', 'br',
    'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'div', 'span', 'hr', 'img',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    img: ['src', 'alt', 'width', 'height'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
};

// ─── Public API ─────────────────────────────────────────────

/**
 * Sanitize HTML email content using a strict allowlist.
 *
 * Strips: script, iframe, style, event handlers, javascript:/data: URLs.
 * Preserves: basic formatting, links, tables, images with safe src.
 */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

/**
 * Parse a raw MIME email source into structured data.
 *
 * Uses mailparser's simpleParser to extract all fields, then normalizes
 * edge cases (missing subject, missing messageId, references as string
 * vs array) and sanitizes HTML content.
 */
export async function parseEmail(source: Buffer): Promise<ParsedEmail> {
  const parsed = await simpleParser(source);

  // Extract sender — mailparser returns AddressObject with .value array
  const fromEntry = parsed.from?.value?.[0];
  const from = {
    name: fromEntry?.name ?? '',
    address: fromEntry?.address ?? '',
  };

  // Extract recipients — handle single AddressObject or array
  const toValue = parsed.to;
  const toEntries = Array.isArray(toValue)
    ? toValue.flatMap((addr) => addr.value)
    : toValue?.value ?? [];
  const to = toEntries.map((entry) => ({
    name: entry.name ?? '',
    address: entry.address ?? '',
  }));

  // Normalize references to string array
  let references: string[];
  if (Array.isArray(parsed.references)) {
    references = parsed.references;
  } else if (typeof parsed.references === 'string') {
    // Single reference string — may contain multiple space-separated IDs
    references = parsed.references.split(/\s+/).filter(Boolean);
  } else {
    references = [];
  }

  // Sanitize HTML content
  const html = sanitizeEmailHtml(
    typeof parsed.html === 'string' ? parsed.html : '',
  );

  return {
    messageId: parsed.messageId ?? '',
    inReplyTo: parsed.inReplyTo ?? undefined,
    references,
    from,
    to,
    subject: parsed.subject ?? '(no subject)',
    text: parsed.text ?? '',
    html,
    date: parsed.date ?? new Date(),
    rawSource: source,
  };
}
