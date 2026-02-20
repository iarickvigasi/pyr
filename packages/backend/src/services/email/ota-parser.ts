// ─── OTA Parser Registry ─────────────────────────────────────
//
// Pluggable strategy pattern for parsing OTA booking notification emails.
// Each OTA platform registers a parser that knows how to extract structured
// booking data from that platform's email format.

// ─── Types ──────────────────────────────────────────────────

/** Structured booking data extracted from an OTA notification email */
export interface OtaBookingData {
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  checkIn: string | null;
  checkOut: string | null;
  packageName: string | null;
  totalPrice: number | null; // integer cents
  currency: string;
  otaPlatform: string;
  otaReferenceId: string | null;
  rawFields: Record<string, string>;
  needsReview: boolean;
  parseErrors: string[];
}

/** Parser interface for a specific OTA platform */
export interface OtaParser {
  platform: string;
  canParse(fromAddress: string, subject: string): boolean;
  parse(html: string, text: string, subject: string): OtaBookingData;
}

// ─── Registry ───────────────────────────────────────────────

const parsers: OtaParser[] = [];

/**
 * Register an OTA parser in the registry.
 * Parsers are checked in registration order when processing emails.
 */
export function registerOtaParser(parser: OtaParser): void {
  throw new Error('Not implemented');
}

/**
 * Attempt to parse an email as an OTA booking notification.
 * Iterates registered parsers and returns the result from the first
 * parser whose canParse returns true.
 *
 * @returns OtaBookingData if a parser matched, null otherwise
 */
export function parseOtaEmail(
  fromAddress: string,
  subject: string,
  html: string,
  text: string,
): OtaBookingData | null {
  throw new Error('Not implemented');
}
