import type { InboxClassification } from './inbox-classification.js';

/**
 * Backward-compatible alias for legacy tests/imports.
 */
export type EmailCategory = InboxClassification;

export interface ClassificationResult {
  category: InboxClassification;
  confidence: number;
  reason: string;
  source: 'rules' | 'openclaw' | 'openclaw_error';
}

interface RuleCategory {
  category: InboxClassification;
  confidence: number;
}

const OTA_DOMAIN_MAP: Array<{ suffix: string; category: RuleCategory }> = [
  { suffix: 'tripaneer.com', category: { category: 'ota_tripaneer', confidence: 0.98 } },
  { suffix: 'bookyogaretreats.com', category: { category: 'ota_bookyogaretreats', confidence: 0.98 } },
  { suffix: 'bookretreats.com', category: { category: 'ota_other', confidence: 0.95 } },
  { suffix: 'getyourguide.com', category: { category: 'ota_other', confidence: 0.95 } },
  { suffix: 'viator.com', category: { category: 'ota_other', confidence: 0.95 } },
];

const SYSTEM_SENDER_PATTERNS = [
  /^postmaster@/i,
  /^mailer-daemon@/i,
  /^bounce@/i,
] as const;

const SYSTEM_SUBJECT_PATTERNS = [
  /delivery.*notification/i,
  /undeliverable/i,
  /mail delivery subsystem/i,
] as const;

const NEWSLETTER_SENDER_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /^newsletter@/i,
  /^marketing@/i,
] as const;

const NEWSLETTER_SUBJECT_PATTERNS = [
  /unsubscribe/i,
  /weekly digest/i,
  /special offer/i,
  /promotional/i,
] as const;

function extractDomain(address: string): string {
  const idx = address.lastIndexOf('@');
  return idx >= 0 ? address.slice(idx + 1).toLowerCase() : '';
}

function matchesAny(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

export function classifyEmailByRules(
  from: { address: string },
  subject: string,
): ClassificationResult {
  const address = from.address.trim().toLowerCase();
  const domain = extractDomain(address);

  for (const ota of OTA_DOMAIN_MAP) {
    if (domain.endsWith(ota.suffix)) {
      return {
        category: ota.category.category,
        confidence: ota.category.confidence,
        reason: `Sender domain matched OTA platform "${ota.suffix}"`,
        source: 'rules',
      };
    }
  }

  if (matchesAny(address, SYSTEM_SENDER_PATTERNS) || matchesAny(subject, SYSTEM_SUBJECT_PATTERNS)) {
    return {
      category: 'other',
      confidence: 0.9,
      reason: 'Matched system sender/subject pattern',
      source: 'rules',
    };
  }

  if (matchesAny(address, NEWSLETTER_SENDER_PATTERNS) || matchesAny(subject, NEWSLETTER_SUBJECT_PATTERNS)) {
    return {
      category: 'other',
      confidence: 0.82,
      reason: 'Matched newsletter/spam pattern',
      source: 'rules',
    };
  }

  return {
    category: 'conversation',
    confidence: 0.62,
    reason: 'No non-conversation rule matched',
    source: 'rules',
  };
}

/**
 * Backward-compatible alias kept for existing call sites and tests.
 */
export const classifyEmail = classifyEmailByRules;

/**
 * Backward-compatible placeholder API kept for callers that still expect an
 * async classifier function. It intentionally uses rules as a deterministic
 * fallback and never calls external services.
 */
export async function classifyWithAi(
  content: string,
  metadata?: Record<string, unknown>,
): Promise<ClassificationResult> {
  const fromAddress = typeof metadata?.['from'] === 'string' ? metadata['from'] : '';
  const subject = typeof metadata?.['subject'] === 'string' ? metadata['subject'] : content.slice(0, 120);
  return classifyEmailByRules({ address: fromAddress }, subject);
}

export function isSystemSender(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  const domain = extractDomain(normalized);

  if (OTA_DOMAIN_MAP.some((ota) => domain.endsWith(ota.suffix))) {
    return true;
  }

  if (matchesAny(normalized, SYSTEM_SENDER_PATTERNS)) {
    return true;
  }

  if (matchesAny(normalized, NEWSLETTER_SENDER_PATTERNS)) {
    return true;
  }

  return false;
}
