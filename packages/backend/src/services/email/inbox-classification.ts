/**
 * Canonical inbox classification taxonomy.
 *
 * Legacy values are kept for backward compatibility with existing rows and
 * manual reclassification actions from older UI/tooling versions.
 */

export const INBOX_CLASSIFICATIONS = [
  'conversation',
  'ota_tripaneer',
  'ota_bookyogaretreats',
  'ota_other',
  'other',
  // Legacy values (already persisted in existing environments)
  'guest_inquiry',
  'ota_notification',
  'spam_newsletter',
  'admin_system',
] as const;

export type InboxClassification = (typeof INBOX_CLASSIFICATIONS)[number];

export const CONVERSATION_OTA_CLASSIFICATIONS: readonly InboxClassification[] = [
  'conversation',
  'ota_tripaneer',
  'ota_bookyogaretreats',
  'ota_other',
  'guest_inquiry',
  'ota_notification',
] as const;

export const OTHER_CLASSIFICATIONS: readonly InboxClassification[] = [
  'other',
  'spam_newsletter',
  'admin_system',
] as const;

export const INBOX_TAB_BUCKETS = [
  'conversation_ota',
  'other',
] as const;

export type InboxTabBucket = (typeof INBOX_TAB_BUCKETS)[number];

export function isConversationClassification(value: string | null | undefined): boolean {
  if (!value) return false;
  return value === 'conversation' || value === 'guest_inquiry';
}

export function isOtaClassification(value: string | null | undefined): boolean {
  if (!value) return false;
  return (
    value === 'ota_tripaneer' ||
    value === 'ota_bookyogaretreats' ||
    value === 'ota_other' ||
    value === 'ota_notification'
  );
}

export function isConversationOrOtaClassification(value: string | null | undefined): boolean {
  return isConversationClassification(value) || isOtaClassification(value);
}

export function normalizePrimaryClassification(
  value: string | null | undefined,
): 'conversation' | 'ota' | 'other' {
  if (isConversationClassification(value)) return 'conversation';
  if (isOtaClassification(value)) return 'ota';
  return 'other';
}
