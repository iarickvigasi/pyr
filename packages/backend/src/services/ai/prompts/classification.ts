/**
 * Classification prompt templates.
 *
 * Placeholder for future LLM-based classification (not used in Phase 4).
 * Pattern-based classification via classifier.ts is the primary approach.
 * If pattern matching proves insufficient in UAT, this module provides
 * the prompt templates for LLM-enhanced classification.
 */

// ─── Constants ───────────────────────────────────────────

/**
 * System prompt template for LLM-based email classification.
 * Reserved for future use -- Phase 4 uses pattern-based classification.
 */
export const CLASSIFICATION_PROMPT = `You are an email classification assistant for Puppy Yoga Retreat.

Classify the following email message into one of these categories:
- guest_inquiry: A genuine question or booking request from a potential or existing guest
- ota_notification: An automated notification from an Online Travel Agency (Tripaneer, BookYogaRetreats, GetYourGuide, Viator)
- spam_newsletter: Marketing emails, newsletters, or unsolicited messages
- admin_system: System notifications, delivery reports, or administrative messages

Also identify any edge case flags:
- complaint: Guest expressing dissatisfaction or requesting compensation
- medical: Medical conditions, disabilities, or accessibility needs
- dietary: Dietary restrictions, allergies, or food requirements
- cancellation: Cancellation request, date change, or inability to attend
- adoption: Interest in adopting one of the rescue puppies

Respond with JSON: { "category": string, "confidence": number, "flags": string[], "reason": string }`;

// ─── Public API ──────────────────────────────────────────

/**
 * Format message content and metadata for LLM classification.
 *
 * @param content - The email/message text to classify
 * @param metadata - Optional metadata (sender address, subject, etc.)
 * @returns Formatted context string for the classification prompt
 */
export function formatClassificationContext(
  content: string,
  metadata?: Record<string, unknown>,
): string {
  const parts: string[] = [];

  if (metadata) {
    if (metadata['from']) parts.push(`From: ${String(metadata['from'])}`);
    if (metadata['subject']) parts.push(`Subject: ${String(metadata['subject'])}`);
    if (metadata['channel']) parts.push(`Channel: ${String(metadata['channel'])}`);
  }

  parts.push(`\nMessage:\n${content}`);

  return parts.join('\n');
}
