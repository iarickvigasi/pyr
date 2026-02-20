// ─── Tripaneer / BookYogaRetreats OTA Parser ─────────────────
//
// Parses booking notification emails from Tripaneer and BookYogaRetreats
// platforms. Uses multi-strategy field extraction (label-based, regex,
// positional) to handle varying email formats.

import type { OtaParser, OtaBookingData } from '../ota-parser.js';

// ─── Domain matching ────────────────────────────────────────

const TRIPANEER_DOMAINS = ['tripaneer.com', 'bookyogaretreats.com'];

function extractDomain(address: string): string {
  const atIndex = address.lastIndexOf('@');
  return atIndex >= 0 ? address.slice(atIndex + 1).toLowerCase() : '';
}

// ─── Field extraction helpers ───────────────────────────────

/**
 * Strip HTML tags to get plain text for extraction.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#?\w+;/g, ' ')
    .trim();
}

/**
 * Try to extract a field value using multiple label patterns.
 * Searches for patterns like "Label: Value" in the text.
 */
function extractField(text: string, labels: string[]): string | null {
  for (const label of labels) {
    // Pattern: label followed by colon/semicolon, then value until newline or end
    const pattern = new RegExp(
      `${escapeRegex(label)}\\s*[:;]\\s*(.+?)(?:\\n|$)`,
      'im',
    );
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = match[1].trim();
      if (value.length > 0) return value;
    }
  }
  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract email address from text using regex.
 */
function extractEmail(text: string): string | null {
  // Look for labeled email first
  const labeledEmail = extractField(text, ['Email', 'E-mail', 'Contact email', 'Guest email']);
  if (labeledEmail) {
    // Validate it looks like an email
    const emailMatch = labeledEmail.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
    if (emailMatch) return emailMatch[0].toLowerCase();
  }

  // Fall back to finding any email in the text (skip OTA addresses)
  const allEmails = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/g);
  if (allEmails) {
    for (const email of allEmails) {
      const domain = extractDomain(email);
      if (!TRIPANEER_DOMAINS.some((d) => domain.endsWith(d))) {
        return email.toLowerCase();
      }
    }
  }

  return null;
}

/**
 * Extract a phone number from labeled text.
 */
function extractPhone(text: string): string | null {
  return extractField(text, ['Phone', 'Telephone', 'Tel', 'Mobile', 'Contact number']);
}

/**
 * Extract a date string from labeled text.
 * Supports multiple formats: "Month DD, YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "DD Month YYYY".
 */
function extractDate(text: string, labels: string[]): string | null {
  const value = extractField(text, labels);
  if (!value) return null;

  // Check various date patterns
  const patterns = [
    // "March 15, 2026" or "March 15 2026"
    /[A-Z][a-z]+\s+\d{1,2},?\s+\d{4}/,
    // "15 March 2026"
    /\d{1,2}\s+[A-Z][a-z]+\s+\d{4}/,
    // "15/03/2026" or "15.03.2026"
    /\d{1,2}[/.]\d{1,2}[/.]\d{4}/,
    // "2026-03-15"
    /\d{4}-\d{2}-\d{2}/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[0];
  }

  // Return raw value if it looks date-like (has digits)
  if (/\d/.test(value)) return value;

  return null;
}

/**
 * Extract price in integer cents from text.
 * Handles formats: "EUR 1,250.00", "EUR 850", "850.00", euro symbol.
 */
function extractPrice(text: string): number | null {
  // Pattern: EUR/euro/euro-sign followed by optional space and number
  const patterns = [
    /(?:EUR|Euro|€)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:EUR|Euro|€)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      // Remove commas (thousand separators) and parse
      const cleaned = match[1].replace(/,/g, '');
      const amount = parseFloat(cleaned);
      if (!isNaN(amount)) {
        return Math.round(amount * 100);
      }
    }
  }

  return null;
}

/**
 * Extract OTA booking reference ID.
 */
function extractReferenceId(text: string): string | null {
  // Look for labeled reference
  const labeled = extractField(text, [
    'Booking ID',
    'Reference',
    'Booking Reference',
    'Confirmation',
    'Booking number',
    'Order ID',
  ]);
  if (labeled) return labeled;

  // Look for pattern like TR-12345 or BYR-12345
  const match = text.match(/\b(TR|BYR|TRIP)-\d{3,}\b/i);
  if (match) return match[0];

  return null;
}

/**
 * Extract package/retreat name.
 */
function extractPackage(text: string): string | null {
  return extractField(text, [
    'Package',
    'Retreat',
    'Program',
    'Programme',
    'Retreat package',
    'Booking for',
  ]);
}

/**
 * Extract guest name using multiple label strategies.
 */
function extractGuestName(text: string): string | null {
  return extractField(text, [
    'Guest name',
    'Name',
    'Customer',
    'Booked by',
    'Guest',
    'Client name',
    'Client',
    'Full name',
  ]);
}

// ─── Parser Implementation ─────────────────────────────────

export const tripaneerParser: OtaParser = {
  platform: 'tripaneer',

  canParse(fromAddress: string, _subject: string): boolean {
    const domain = extractDomain(fromAddress);
    return TRIPANEER_DOMAINS.some((d) => domain.endsWith(d));
  },

  parse(html: string, text: string, _subject: string): OtaBookingData {
    // Combine HTML-stripped and plain text for extraction
    const strippedHtml = stripHtml(html);
    const combined = strippedHtml + '\n' + text;

    const rawFields: Record<string, string> = {};
    const parseErrors: string[] = [];

    // Extract fields
    const guestName = extractGuestName(combined);
    if (guestName) rawFields.guestName = guestName;
    if (!guestName) parseErrors.push('guestName');

    const guestEmail = extractEmail(combined);
    if (guestEmail) rawFields.guestEmail = guestEmail;
    if (!guestEmail) parseErrors.push('guestEmail');

    const guestPhone = extractPhone(combined);
    if (guestPhone) rawFields.guestPhone = guestPhone;

    const checkIn = extractDate(combined, [
      'Check-in',
      'Check in',
      'Checkin',
      'Arrival',
      'Start date',
      'From',
    ]);
    if (checkIn) rawFields.checkIn = checkIn;
    if (!checkIn) parseErrors.push('checkIn');

    const checkOut = extractDate(combined, [
      'Check-out',
      'Check out',
      'Checkout',
      'Departure',
      'End date',
      'To',
    ]);
    if (checkOut) rawFields.checkOut = checkOut;
    if (!checkOut) parseErrors.push('checkOut');

    const packageName = extractPackage(combined);
    if (packageName) rawFields.packageName = packageName;

    const totalPrice = extractPrice(combined);
    if (totalPrice !== null) rawFields.totalPrice = String(totalPrice);

    const otaReferenceId = extractReferenceId(combined);
    if (otaReferenceId) rawFields.otaReferenceId = otaReferenceId;

    // needsReview is true if any critical field is missing
    const needsReview = !guestName || !checkIn || !checkOut;

    return {
      guestName,
      guestEmail,
      guestPhone,
      checkIn,
      checkOut,
      packageName,
      totalPrice,
      currency: 'EUR',
      otaPlatform: 'tripaneer',
      otaReferenceId,
      rawFields,
      needsReview,
      parseErrors,
    };
  },
};
