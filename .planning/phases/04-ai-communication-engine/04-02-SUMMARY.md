---
phase: 04-ai-communication-engine
plan: 02
subsystem: ai
tags: [classifier, prompts, cost-calculator, context-builder, bilingual, tdd]

# Dependency graph
requires:
  - phase: 04-ai-communication-engine/01
    provides: Agent API service functions (getConversationContext, getAvailabilitySummary, getUpcomingEvents)
provides:
  - Edge-case classifier with bilingual EN/DE pattern detection (classifyEdgeCases, EDGE_CASE_PATTERNS)
  - System prompt template with brand voice prefix (>4000 chars for Anthropic caching), guardrails, and dynamic context injection
  - Context builder that aggregates guest CRM, bookings, availability, events from Prisma into DraftContext
  - Cost calculator converting token usage to EUR microcents with model-specific pricing (calculateCost, MODEL_PRICING, formatCostEur)
  - Classification prompt placeholder for future LLM-based classification
affects: [04-ai-communication-engine/03, draft-generation, agent-api]

# Tech tracking
tech-stack:
  added: []
  patterns: [pattern-based-classification, system-prompt-assembly, microcent-cost-tracking, prefix-matching-pricing]

key-files:
  created:
    - packages/backend/src/services/ai/classifier.ts
    - packages/backend/src/services/ai/cost-calculator.ts
    - packages/backend/src/services/ai/prompts/system.ts
    - packages/backend/src/services/ai/prompts/classification.ts
    - packages/backend/src/services/ai/__tests__/classifier.test.ts
    - packages/backend/src/services/ai/__tests__/context-builder.test.ts
  modified:
    - packages/backend/src/services/ai/context-builder.ts

key-decisions:
  - "Pattern-only classification (no LLM) for edge-case detection -- zero cost, instant, sufficient for EN/DE binary"
  - "Cost stored as EUR microcents (EUR * 100,000) for 5 decimal places of precision"
  - "MODEL_PRICING keyed by prefix with longest-first matching to avoid gpt-4o matching gpt-4o-mini"
  - "BRAND_VOICE_PREFIX at 5449 chars exceeds Anthropic 1024-token cache threshold"
  - "Context builder replicates agent service data aggregation pattern for independence"

patterns-established:
  - "Edge-case classifier: pattern-based keyword detection with bilingual regex arrays per category"
  - "System prompt assembly: BRAND_VOICE_PREFIX + guest section + bookings + availability + events + guardrails + language instruction"
  - "Cost calculation: model prefix matching + USD-to-EUR conversion + microcent integer storage"

requirements-completed: [AI-01, AI-03, AI-05]

# Metrics
duration: 7min
completed: 2026-02-20
---

# Phase 4 Plan 02: Context Builder & Classifier Summary

**Bilingual edge-case classifier with 5 categories, system prompt templates with brand voice/guardrails, context builder aggregating CRM/availability/events, and cost calculator with Anthropic+OpenAI model pricing**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-20T13:16:01Z
- **Completed:** 2026-02-20T13:22:41Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Edge-case classifier detects complaints, medical/dietary, cancellations, and adoption inquiries in both English and German
- System prompt template with 5449-char brand voice prefix (above Anthropic caching threshold), 7 guardrails, and dynamic guest context injection
- Context builder aggregates conversation, guest profile, booking history, 90-day availability, and 30-day events from Prisma
- Cost calculator handles Anthropic (Sonnet 4.5, Haiku 3.5 with cache tokens) and OpenAI (GPT-4o, GPT-4o-mini) pricing
- 71 tests passing with no LLM calls (pure business logic)

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD -- Edge-case classifier and cost calculator** - `29a24c0` (test) + `8c1405f` (feat)
2. **Task 2: Context builder with system prompt templates** - `b4a1d41` (feat)

_TDD task has separate test and implementation commits._

## Files Created/Modified
- `packages/backend/src/services/ai/classifier.ts` - Bilingual edge-case classifier with 5 categories (complaint, medical, dietary, cancellation, adoption)
- `packages/backend/src/services/ai/cost-calculator.ts` - Token-to-EUR microcent cost calculation with model-specific pricing
- `packages/backend/src/services/ai/prompts/system.ts` - Brand voice prefix, guardrails, formatting helpers, buildSystemPrompt
- `packages/backend/src/services/ai/prompts/classification.ts` - Classification prompt placeholder for future LLM-based classification
- `packages/backend/src/services/ai/context-builder.ts` - DraftContext type and buildDraftContext with Prisma data aggregation
- `packages/backend/src/services/ai/__tests__/classifier.test.ts` - 40 tests for classifier and cost calculator
- `packages/backend/src/services/ai/__tests__/context-builder.test.ts` - 31 tests for context builder, system prompt, and formatting helpers

## Decisions Made
- Pattern-only classification (no LLM) for edge-case detection -- zero cost, instant, accurate for EN/DE
- Cost stored as EUR microcents (EUR * 100,000) for 5 decimal places of precision per call
- MODEL_PRICING keys sorted by length descending to prevent gpt-4o prefix matching gpt-4o-mini
- BRAND_VOICE_PREFIX at 5449 chars comfortably exceeds the 1024-token Anthropic prompt caching minimum
- Context builder creates its own Prisma queries (mirrors agent service pattern) for module independence

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed adoption pattern for multi-word phrases**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** `take.?home` regex only allowed 0-1 chars between "take" and "home", failing on "take a puppy home"
- **Fix:** Changed to `take.*home` to allow arbitrary text between words
- **Files modified:** packages/backend/src/services/ai/classifier.ts
- **Verification:** Test passes for "I would love to take a puppy home"
- **Committed in:** 8c1405f

**2. [Rule 1 - Bug] Fixed MODEL_PRICING prefix matching order**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** `gpt-4o` prefix matched before `gpt-4o-mini` due to Object.keys iteration order
- **Fix:** Sort pricing keys by length descending so longer prefixes match first
- **Files modified:** packages/backend/src/services/ai/cost-calculator.ts
- **Verification:** GPT-4o-mini cost calculation returns correct value (41 microcents)
- **Committed in:** 8c1405f

**3. [Rule 1 - Bug] Fixed MODEL_PRICING TypeScript type**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** `Record<string, ModelPricing> & { lastUpdated: string }` type conflict -- lastUpdated is string, not ModelPricing
- **Fix:** Created `ModelPricingTable` interface with explicit index signature allowing both ModelPricing and string values
- **Files modified:** packages/backend/src/services/ai/cost-calculator.ts, classifier.test.ts
- **Verification:** `tsc --noEmit` passes clean
- **Committed in:** 8c1405f

---

**Total deviations:** 3 auto-fixed (3 bug fixes)
**Impact on plan:** All fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Context builder and system prompt templates ready for Plan 03 (draft generator)
- Classifier ready for integration into email pipeline to flag edge cases
- Cost calculator ready for logging costs on every AI call
- All modules are pure business logic with no LLM dependencies -- safe for unit testing

## Self-Check: PASSED

All 7 created files verified on disk. All 3 task commits (29a24c0, 8c1405f, b4a1d41) found in git log.

---
*Phase: 04-ai-communication-engine*
*Completed: 2026-02-20*
