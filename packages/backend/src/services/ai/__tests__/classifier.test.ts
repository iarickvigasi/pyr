import { describe, it, expect } from 'vitest';
import { classifyEdgeCases, EDGE_CASE_PATTERNS } from '../classifier.js';
import { calculateCost, MODEL_PRICING, formatCostEur } from '../cost-calculator.js';

// ─── Edge-case classifier tests ─────────────────────────

describe('classifyEdgeCases', () => {
  describe('complaint detection', () => {
    it('detects "I am very unhappy with the room" as complaint', () => {
      expect(classifyEdgeCases('I am very unhappy with the room')).toContain('complaint');
    });

    it('detects "I was disappointed by the food" as complaint', () => {
      expect(classifyEdgeCases('I was disappointed by the food')).toContain('complaint');
    });

    it('detects "I want a refund for my booking" as complaint', () => {
      expect(classifyEdgeCases('I want a refund for my booking')).toContain('complaint');
    });

    it('detects German "Ich bin unzufrieden mit dem Zimmer" as complaint', () => {
      expect(classifyEdgeCases('Ich bin unzufrieden mit dem Zimmer')).toContain('complaint');
    });

    it('detects German "Ich möchte eine Erstattung" as complaint', () => {
      expect(classifyEdgeCases('Ich möchte eine Erstattung')).toContain('complaint');
    });
  });

  describe('medical/dietary detection', () => {
    it('detects "I have severe nut allergies" as medical or dietary', () => {
      const flags = classifyEdgeCases('I have severe nut allergies');
      expect(flags.some((f) => f === 'medical' || f === 'dietary')).toBe(true);
    });

    it('detects "I need a wheelchair accessible room" as medical', () => {
      expect(classifyEdgeCases('I need a wheelchair accessible room')).toContain('medical');
    });

    it('detects "Is the food gluten free?" as dietary', () => {
      expect(classifyEdgeCases('Is the food gluten free?')).toContain('dietary');
    });

    it('detects "I\'m vegan, are meals included?" as dietary', () => {
      expect(classifyEdgeCases("I'm vegan, are meals included?")).toContain('dietary');
    });

    it('detects German "Ich bin laktoseintolerant" as dietary', () => {
      expect(classifyEdgeCases('Ich bin laktoseintolerant')).toContain('dietary');
    });

    it('detects German "Ich habe eine Nussallergie" as dietary', () => {
      expect(classifyEdgeCases('Ich habe eine Nussallergie')).toContain('dietary');
    });
  });

  describe('cancellation detection', () => {
    it('detects "I need to cancel my booking" as cancellation', () => {
      expect(classifyEdgeCases('I need to cancel my booking')).toContain('cancellation');
    });

    it('detects "Can I change my dates to April?" as cancellation', () => {
      expect(classifyEdgeCases('Can I change my dates to April?')).toContain('cancellation');
    });

    it('detects "We can\'t make it anymore" as cancellation', () => {
      expect(classifyEdgeCases("We can't make it anymore")).toContain('cancellation');
    });

    it('detects German "Ich möchte meine Buchung stornieren" as cancellation', () => {
      expect(classifyEdgeCases('Ich möchte meine Buchung stornieren')).toContain('cancellation');
    });

    it('detects German "Können wir umbuchen?" as cancellation', () => {
      expect(classifyEdgeCases('Können wir umbuchen?')).toContain('cancellation');
    });
  });

  describe('adoption detection', () => {
    it('detects "Can I adopt one of the puppies?" as adoption', () => {
      expect(classifyEdgeCases('Can I adopt one of the puppies?')).toContain('adoption');
    });

    it('detects "I would love to take a puppy home" as adoption', () => {
      expect(classifyEdgeCases('I would love to take a puppy home')).toContain('adoption');
    });

    it('detects "Are any of the rescue dogs available?" as adoption', () => {
      expect(classifyEdgeCases('Are any of the rescue dogs available?')).toContain('adoption');
    });

    it('detects German "Kann ich einen Welpen adoptieren?" as adoption', () => {
      expect(classifyEdgeCases('Kann ich einen Welpen adoptieren?')).toContain('adoption');
    });
  });

  describe('multiple flags', () => {
    it('detects both cancellation and complaint in "I want to cancel and get a refund"', () => {
      const flags = classifyEdgeCases('I want to cancel and get a refund');
      expect(flags).toContain('cancellation');
      expect(flags).toContain('complaint');
    });
  });

  describe('clean inquiries (no flags)', () => {
    it('returns empty for "I would like to book a 4-day retreat in April"', () => {
      expect(classifyEdgeCases('I would like to book a 4-day retreat in April')).toEqual([]);
    });

    it('returns empty for "What dates are available in May?"', () => {
      expect(classifyEdgeCases('What dates are available in May?')).toEqual([]);
    });

    it('returns empty for "How much does the retreat cost?"', () => {
      expect(classifyEdgeCases('How much does the retreat cost?')).toEqual([]);
    });
  });

  describe('EDGE_CASE_PATTERNS export', () => {
    it('exports patterns for all five categories', () => {
      expect(Object.keys(EDGE_CASE_PATTERNS)).toEqual(
        expect.arrayContaining(['complaint', 'medical', 'dietary', 'cancellation', 'adoption']),
      );
    });
  });
});

// ─── Cost calculator tests ──────────────────────────────

describe('calculateCost', () => {
  it('calculates cost for Claude Sonnet 4.5 with cache tokens', () => {
    const cost = calculateCost(
      {
        inputTokens: 2000,
        outputTokens: 500,
        cacheCreationTokens: 1500,
        cacheReadTokens: 500,
      },
      'claude-sonnet-4-5-20250929',
    );
    // Expected: (2000 * 3.00 / 1M) + (500 * 15.00 / 1M) + (1500 * 3.75 / 1M) + (500 * 0.30 / 1M)
    //         = 0.006 + 0.0075 + 0.005625 + 0.00015 = $0.019275
    // In EUR: 0.019275 * 0.92 = 0.017733
    // In microcents: 0.017733 * 100_000 = 1773
    expect(cost).toBe(1773);
  });

  it('calculates cost for Claude Haiku 3.5', () => {
    const cost = calculateCost(
      { inputTokens: 1000, outputTokens: 200 },
      'claude-haiku-3-5-20250929',
    );
    // (1000 * 0.80 / 1M) + (200 * 4.00 / 1M) = 0.0008 + 0.0008 = $0.0016
    // In EUR: 0.0016 * 0.92 = 0.001472
    // In microcents: 0.001472 * 100_000 = 147
    expect(cost).toBe(147);
  });

  it('calculates cost for GPT-4o', () => {
    const cost = calculateCost(
      { inputTokens: 1000, outputTokens: 500 },
      'gpt-4o-2024-08-06',
    );
    // (1000 * 2.50 / 1M) + (500 * 10.00 / 1M) = 0.0025 + 0.005 = $0.0075
    // In EUR: 0.0075 * 0.92 = 0.0069
    // In microcents: 0.0069 * 100_000 = 690
    expect(cost).toBe(690);
  });

  it('calculates cost for GPT-4o-mini', () => {
    const cost = calculateCost(
      { inputTokens: 1000, outputTokens: 500 },
      'gpt-4o-mini',
    );
    // (1000 * 0.15 / 1M) + (500 * 0.60 / 1M) = 0.00015 + 0.0003 = $0.00045
    // In EUR: 0.00045 * 0.92 = 0.000414
    // In microcents: 0.000414 * 100_000 = 41
    expect(cost).toBe(41);
  });

  it('returns 0 for unknown model', () => {
    const cost = calculateCost(
      { inputTokens: 1000, outputTokens: 500 },
      'unknown-model-v99',
    );
    expect(cost).toBe(0);
  });

  it('handles zero tokens', () => {
    const cost = calculateCost(
      { inputTokens: 0, outputTokens: 0 },
      'claude-sonnet-4-5-20250929',
    );
    expect(cost).toBe(0);
  });

  it('handles missing cache tokens gracefully', () => {
    const cost = calculateCost(
      { inputTokens: 1000, outputTokens: 500 },
      'claude-sonnet-4-5-20250929',
    );
    // (1000 * 3.00 / 1M) + (500 * 15.00 / 1M) = 0.003 + 0.0075 = $0.0105
    // In EUR: 0.0105 * 0.92 = 0.00966
    // In microcents: 0.00966 * 100_000 = 966
    expect(cost).toBe(966);
  });
});

describe('MODEL_PRICING', () => {
  it('includes pricing for Claude Sonnet 4.5', () => {
    expect(MODEL_PRICING['claude-sonnet-4-5']).toBeDefined();
    expect(MODEL_PRICING['claude-sonnet-4-5']!.inputPerMTok).toBe(3.0);
    expect(MODEL_PRICING['claude-sonnet-4-5']!.outputPerMTok).toBe(15.0);
  });

  it('includes pricing for Claude Haiku 3.5', () => {
    expect(MODEL_PRICING['claude-haiku-3-5']).toBeDefined();
  });

  it('includes pricing for GPT-4o and GPT-4o-mini', () => {
    expect(MODEL_PRICING['gpt-4o']).toBeDefined();
    expect(MODEL_PRICING['gpt-4o-mini']).toBeDefined();
  });

  it('has a lastUpdated field', () => {
    expect(MODEL_PRICING.lastUpdated).toBe('2026-02-20');
  });
});

describe('formatCostEur', () => {
  it('formats 12345 microcents as "0.1235"', () => {
    expect(formatCostEur(12345)).toBe('0.1235');
  });

  it('formats 0 microcents', () => {
    expect(formatCostEur(0)).toBe('0.0000');
  });

  it('formats small amounts', () => {
    expect(formatCostEur(100)).toBe('0.0010');
  });

  it('formats larger amounts', () => {
    expect(formatCostEur(1000000)).toBe('10.0000');
  });
});
