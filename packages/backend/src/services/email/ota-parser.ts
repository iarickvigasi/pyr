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
 * Duplicate registrations for the same platform are silently ignored.
 */
export function registerOtaParser(parser: OtaParser): void {
  // Avoid duplicate registrations (e.g. from test setup running multiple times)
  if (!parsers.some((p) => p.platform === parser.platform)) {
    parsers.push(parser);
  }
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
  for (const parser of parsers) {
    if (parser.canParse(fromAddress, subject)) {
      return parser.parse(html, text, subject);
    }
  }
  return null;
}
