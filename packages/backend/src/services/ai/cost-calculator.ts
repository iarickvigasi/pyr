/**
 * Token-to-EUR cost calculator for LLM API calls.
 *
 * Converts token usage to EUR microcents (EUR * 100,000) using model-specific
 * pricing tables. Supports Anthropic (Claude) models with prompt caching
 * and OpenAI models.
 *
 * Microcent precision: 1 microcent = EUR 0.00001 = $0.00001
 * This provides 5 decimal places of precision, sufficient for per-call tracking
 * where typical costs are fractions of a cent.
 */

// ─── Types ───────────────────────────────────────────────

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWritePerMTok?: number;
  cacheReadPerMTok?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

// ─── Pricing table ───────────────────────────────────────

export interface ModelPricingTable {
  [modelPrefix: string]: ModelPricing | string | undefined;
  lastUpdated: string;
}

/**
 * Model pricing in USD per million tokens.
 * Keyed by model name prefix for flexible matching (e.g., 'claude-sonnet-4-5' matches 'claude-sonnet-4-5-20250929').
 */
export const MODEL_PRICING: ModelPricingTable = {
  'claude-sonnet-4-5': {
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cacheWritePerMTok: 3.75,
    cacheReadPerMTok: 0.3,
  },
  'claude-haiku-3-5': {
    inputPerMTok: 0.8,
    outputPerMTok: 4.0,
    cacheWritePerMTok: 1.0,
    cacheReadPerMTok: 0.08,
  },
  'gpt-4o': {
    inputPerMTok: 2.5,
    outputPerMTok: 10.0,
  },
  'gpt-4o-mini': {
    inputPerMTok: 0.15,
    outputPerMTok: 0.6,
  },
  lastUpdated: '2026-02-20',
};

/** Fixed USD to EUR conversion rate */
const USD_TO_EUR = 0.92;

// ─── Public API ──────────────────────────────────────────

/**
 * Calculate the cost of an LLM API call in EUR microcents.
 *
 * @param usage - Token counts from the LLM response
 * @param model - Full model name (e.g., 'claude-sonnet-4-5-20250929')
 * @returns Cost in EUR microcents (integer). Returns 0 if model pricing not found.
 */
export function calculateCost(usage: TokenUsage, model: string): number {
  const pricing = findPricing(model);

  if (!pricing) {
    // Unknown model -- log warning in production, return 0
    if (typeof process !== 'undefined' && process.env?.['NODE_ENV'] !== 'test') {
      console.warn(`[cost-calculator] Unknown model pricing for: ${model}`);
    }
    return 0;
  }

  const inputCost = (usage.inputTokens * pricing.inputPerMTok) / 1_000_000;
  const outputCost = (usage.outputTokens * pricing.outputPerMTok) / 1_000_000;
  const cacheWriteCost =
    pricing.cacheWritePerMTok && usage.cacheCreationTokens
      ? (usage.cacheCreationTokens * pricing.cacheWritePerMTok) / 1_000_000
      : 0;
  const cacheReadCost =
    pricing.cacheReadPerMTok && usage.cacheReadTokens
      ? (usage.cacheReadTokens * pricing.cacheReadPerMTok) / 1_000_000
      : 0;

  const totalUsd = inputCost + outputCost + cacheWriteCost + cacheReadCost;
  const totalEur = totalUsd * USD_TO_EUR;

  // Convert to microcents (EUR * 100,000) and round to integer
  return Math.round(totalEur * 100_000);
}

/**
 * Format EUR microcents as a human-readable EUR string with 4 decimal places.
 *
 * @param microcents - Cost in EUR microcents
 * @returns Formatted string, e.g., "0.1235"
 */
export function formatCostEur(microcents: number): string {
  const eur = microcents / 100_000;
  return eur.toFixed(4);
}

// ─── Helpers ─────────────────────────────────────────────

function findPricing(model: string): ModelPricing | null {
  // Sort keys by length descending so longer prefixes match first
  // (e.g., 'gpt-4o-mini' matches before 'gpt-4o')
  const keys = Object.keys(MODEL_PRICING)
    .filter((k) => k !== 'lastUpdated')
    .sort((a, b) => b.length - a.length);

  for (const key of keys) {
    if (model === key || model.startsWith(key)) {
      return MODEL_PRICING[key] as ModelPricing;
    }
  }
  return null;
}
