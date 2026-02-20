// ─── Types ──────────────────────────────────────────────────

export type EmailCategory = 'guest_inquiry' | 'ota_notification' | 'spam_newsletter' | 'admin_system';

export interface ClassificationResult {
  category: EmailCategory;
  confidence: number;
  reason: string;
}

/** AI classifier interface — Phase 4 will provide a real implementation */
export interface AiClassifier {
  classify(content: string, metadata?: Record<string, unknown>): Promise<ClassificationResult>;
}

// ─── Pattern constants ──────────────────────────────────────

/** OTA platform domains whose emails are booking/inquiry notifications */
const OTA_DOMAINS = [
  'tripaneer.com',
  'bookyogaretreats.com',
  'bookretreats.com',
  'getyourguide.com',
  'viator.com',
];

/** Sender address patterns that indicate spam/newsletter/marketing */
const SPAM_SENDER_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /^newsletter@/i,
  /^marketing@/i,
];

/** Subject line patterns that indicate spam/newsletter */
const SPAM_SUBJECT_PATTERNS = [
  /unsubscribe/i,
];

/** Sender address patterns that indicate system/delivery messages */
const SYSTEM_SENDER_PATTERNS = [
  /^postmaster@/i,
  /^mailer-daemon@/i,
];

/** Subject line patterns that indicate system/delivery messages */
const SYSTEM_SUBJECT_PATTERNS = [
  /delivery.*notification/i,
];

// ─── Helpers ────────────────────────────────────────────────

function extractDomain(address: string): string {
  const atIndex = address.lastIndexOf('@');
  return atIndex >= 0 ? address.slice(atIndex + 1).toLowerCase() : '';
}

function matchesPatterns(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Classify an email using rules-based pattern matching.
 *
 * Checks in priority order:
 * 1. OTA domains (sender domain match)
 * 2. System sender patterns (postmaster, mailer-daemon)
 * 3. System subject patterns (delivery notification)
 * 4. Spam sender patterns (noreply, newsletter, marketing)
 * 5. Spam subject patterns (unsubscribe)
 * 6. Default → guest_inquiry
 */
export function classifyEmail(
  from: { address: string },
  subject: string,
): ClassificationResult {
  const address = from.address.toLowerCase();
  const domain = extractDomain(address);

  // 1. OTA domain check
  if (OTA_DOMAINS.some((ota) => domain.endsWith(ota))) {
    return {
      category: 'ota_notification',
      confidence: 0.95,
      reason: `Sender domain matches OTA platform: ${domain}`,
    };
  }

  // 2. System sender patterns
  if (matchesPatterns(address, SYSTEM_SENDER_PATTERNS)) {
    return {
      category: 'admin_system',
      confidence: 0.9,
      reason: `Sender address matches system pattern: ${address}`,
    };
  }

  // 3. System subject patterns
  if (matchesPatterns(subject, SYSTEM_SUBJECT_PATTERNS)) {
    return {
      category: 'admin_system',
      confidence: 0.85,
      reason: `Subject matches system pattern: "${subject}"`,
    };
  }

  // 4. Spam sender patterns
  if (matchesPatterns(address, SPAM_SENDER_PATTERNS)) {
    return {
      category: 'spam_newsletter',
      confidence: 0.8,
      reason: `Sender address matches spam/newsletter pattern: ${address}`,
    };
  }

  // 5. Spam subject patterns
  if (matchesPatterns(subject, SPAM_SUBJECT_PATTERNS)) {
    return {
      category: 'spam_newsletter',
      confidence: 0.75,
      reason: `Subject matches spam pattern: "${subject}"`,
    };
  }

  // 6. Default
  return {
    category: 'guest_inquiry',
    confidence: 0.6,
    reason: 'No rule matched — default classification',
  };
}

/**
 * AI-based email classification stub.
 *
 * Phase 4 will replace this with a real LLM call via the AI module queue.
 * Currently returns guest_inquiry with low confidence as a safe default.
 */
export async function classifyWithAi(
  _content: string,
  _metadata?: Record<string, unknown>,
): Promise<ClassificationResult> {
  return {
    category: 'guest_inquiry',
    confidence: 0.5,
    reason: 'AI classification not implemented (Phase 4)',
  };
}

/**
 * Check whether an email address belongs to a non-guest sender.
 *
 * Returns true for OTA platforms, spam/newsletter senders, and system
 * addresses. Used by contact-matcher to skip guest creation for these.
 */
export function isSystemSender(address: string): boolean {
  const addr = address.toLowerCase();
  const domain = extractDomain(addr);

  // OTA domain
  if (OTA_DOMAINS.some((ota) => domain.endsWith(ota))) return true;

  // System sender
  if (matchesPatterns(addr, SYSTEM_SENDER_PATTERNS)) return true;

  // Spam/newsletter sender
  if (matchesPatterns(addr, SPAM_SENDER_PATTERNS)) return true;

  return false;
}
