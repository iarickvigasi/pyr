/**
 * Edge-case classifier for incoming guest messages.
 *
 * Pattern-based keyword detection that identifies sensitive messages
 * (complaints, medical/dietary requests, cancellations, adoption inquiries)
 * for priority handling. Messages matching edge cases still get AI drafts
 * but are marked as "sensitive -- review carefully".
 *
 * All patterns support both English and German variants (case-insensitive).
 */

// ─── Pattern definitions ─────────────────────────────────

export const EDGE_CASE_PATTERNS: Record<string, RegExp[]> = {
  complaint: [
    // English
    /unhappy/i,
    /disappointed/i,
    /terrible/i,
    /worst/i,
    /refund/i,
    /compensation/i,
    /unacceptable/i,
    /horrible/i,
    /disgusting/i,
    // German
    /unzufrieden/i,
    /enttäuscht/i,
    /schrecklich/i,
    /erstattung/i,
    /inakzeptabel/i,
  ],
  medical: [
    // English
    /\ballerg/i,
    /\bmedical\b/i,
    /\bdisabilit/i,
    /wheelchair/i,
    /medication/i,
    /mobility/i,
    // German
    /\ballergie/i,
    /medizinisch/i,
    /rollstuhl/i,
    /medikament/i,
    /behinderung/i,
  ],
  dietary: [
    // English
    /\bvegan\b/i,
    /gluten.?free/i,
    /\bceliac\b/i,
    /\blactose\b/i,
    /nut.?allerg/i,
    /vegetarian/i,
    /food.?intoleran/i,
    // German
    /glutenfrei/i,
    /laktose/i,
    /nussallergie/i,
    /laktoseintolerant/i,
    /nahrungsmittelunvertr/i,
  ],
  cancellation: [
    // English
    /\bcancel/i,
    /can'?t.?make.?it/i,
    /change.?my.?dates?/i,
    /change.?dates?/i,
    /reschedule/i,
    /postpone/i,
    // German
    /stornieren/i,
    /absagen/i,
    /umbuchen/i,
    /verschieben/i,
  ],
  adoption: [
    // English
    /\badopt/i,
    /take.*home/i,
    /keep.?the.?puppy/i,
    /rescue.?dogs?.?available/i,
    // German
    /adoptieren/i,
    /mitnehmen/i,
    /behalten/i,
  ],
};

// ─── Public API ──────────────────────────────────────────

/**
 * Classify a message for edge cases by matching against bilingual patterns.
 *
 * @param content - The message text to classify
 * @returns Array of matching flag names (e.g., ['complaint', 'cancellation']).
 *          Returns empty array for clean inquiries with no edge cases.
 */
export function classifyEdgeCases(content: string): string[] {
  const flags: string[] = [];

  for (const [flag, patterns] of Object.entries(EDGE_CASE_PATTERNS)) {
    if (patterns.some((p) => p.test(content))) {
      flags.push(flag);
    }
  }

  return flags;
}
