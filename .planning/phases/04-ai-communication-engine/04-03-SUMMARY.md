---
phase: 04-ai-communication-engine
plan: 03
subsystem: ai
tags: [openclaw, skills, draft-generator, bullmq, ai-module-contract, http-api]

# Dependency graph
requires:
  - phase: 04-ai-communication-engine/01
    provides: "OpenClaw Gateway, Agent API, AiDraft schema with token tracking"
  - phase: 04-ai-communication-engine/02
    provides: "Context builder, classifier, cost calculator, system prompt templates"
provides:
  - "6 OpenClaw SKILL.md files for guests, bookings, events, availability, conversations, and draft domains"
  - "Draft generator calling OpenClaw via POST /v1/chat/completions (OpenAI-compatible HTTP API)"
  - "AiModuleContract implementation bridging email module to OpenClaw (generateDraft, classifyMessage, healthCheck)"
  - "BullMQ ai-draft job processor with deduplication and lazy module initialization"
  - "8 draft generator tests with mocked fetch (no real API calls)"
affects: [05-ai-drafting, 07-assistant, email-pipeline-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [openclaw-http-api, provider-prefix-stripping, skill-per-domain, lazy-module-init]

key-files:
  created:
    - openclaw/workspace/skills/guests/SKILL.md
    - openclaw/workspace/skills/bookings/SKILL.md
    - openclaw/workspace/skills/events/SKILL.md
    - openclaw/workspace/skills/availability/SKILL.md
    - openclaw/workspace/skills/conversations/SKILL.md
    - openclaw/workspace/skills/draft/SKILL.md
    - packages/backend/src/services/ai/__tests__/draft-generator.test.ts
  modified:
    - packages/backend/src/services/ai/draft-generator.ts
    - packages/backend/src/services/ai/index.ts
    - packages/backend/src/services/queue/jobs/ai-draft.job.ts

key-decisions:
  - "Draft generator calls OpenClaw via standard HTTP fetch (no direct LLM SDK imports) -- OpenClaw manages provider selection and failover"
  - "Provider-prefixed model names stripped before cost calculation -- OpenClaw returns 'anthropic/model-name' but pricing table expects 'model-name'"
  - "BullMQ job processor deduplicates by checking for existing pending draft per conversation before generating"
  - "classifyMessage uses pattern-based detection only (no LLM call) -- edge-case flags at zero cost"
  - "healthCheck verifies OpenClaw Gateway reachability -- both primary/fallback treated as available if gateway responds"

patterns-established:
  - "OpenClaw HTTP integration: POST /v1/chat/completions with Bearer token auth and OpenAI-compatible request/response format"
  - "Provider prefix stripping: model strings from OpenClaw contain 'provider/model' format, stripped before pricing lookup"
  - "SKILL.md per domain: concise skill files teaching OpenClaw about agent API endpoints for each business domain"
  - "Lazy module init in job processors: dynamic import of createAiModule avoids circular dependencies"

requirements-completed: [ARCH-03, AI-02, AI-03, AI-05, AI-06]

# Metrics
duration: 5min
completed: 2026-02-20
---

# Phase 4 Plan 03: Skills & Draft Generator Summary

**OpenClaw SKILL.md files for 6 business domains, draft generator via HTTP API with edge-case flags and cost tracking, AiModuleContract implementation, and BullMQ job processor with deduplication**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-20T13:26:22Z
- **Completed:** 2026-02-20T13:31:55Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- 6 SKILL.md files teach OpenClaw about guests, bookings, events, availability, conversations, and draft generation via agent API endpoints
- Draft generator calls OpenClaw via POST /v1/chat/completions (no direct LLM SDK imports) with full context assembly, edge-case classification, and cost tracking
- AiModuleContract fully implemented with generateDraft, classifyMessage, and healthCheck methods
- BullMQ ai-draft job processor handles draft generation jobs with duplicate prevention and error retry
- 79 tests passing across all 3 AI test files (40 classifier + 31 context builder + 8 draft generator)

## Task Commits

Each task was committed atomically:

1. **Task 1: SKILL.md files and draft generator** - `55a1adb` (feat)
2. **Task 2: AiModuleContract, BullMQ job processor, and tests** - `cf04619` (feat)

## Files Created/Modified
- `openclaw/workspace/skills/guests/SKILL.md` - Guest lookup skill for OpenClaw
- `openclaw/workspace/skills/bookings/SKILL.md` - Booking lookup skill for OpenClaw
- `openclaw/workspace/skills/events/SKILL.md` - Event lookup skill for OpenClaw
- `openclaw/workspace/skills/availability/SKILL.md` - Room availability skill for OpenClaw
- `openclaw/workspace/skills/conversations/SKILL.md` - Conversation context skill for OpenClaw
- `openclaw/workspace/skills/draft/SKILL.md` - Draft generation skill with brand voice and guardrails
- `packages/backend/src/services/ai/draft-generator.ts` - Draft generator orchestrating context + OpenClaw HTTP API + classification + cost + DB write
- `packages/backend/src/services/ai/index.ts` - AiModuleContract implementation bridging email module to OpenClaw
- `packages/backend/src/services/queue/jobs/ai-draft.job.ts` - BullMQ job processor with deduplication and lazy init
- `packages/backend/src/services/ai/__tests__/draft-generator.test.ts` - 8 tests for draft generator with mocked fetch

## Decisions Made
- Draft generator uses standard HTTP fetch to call OpenClaw's OpenAI-compatible API -- no LLM SDK dependencies in backend
- Provider-prefixed model names (e.g., "anthropic/claude-sonnet-4-5-20250929") stripped before cost calculator lookup
- BullMQ job processor checks for existing pending draft per conversation before generating (deduplication)
- classifyMessage in AiModuleContract returns pattern-based edge-case flags without any LLM call
- healthCheck treats gateway availability as proxy for both primary and fallback provider health

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed provider-prefixed model names in cost calculation**
- **Found during:** Task 2 (tests)
- **Issue:** OpenClaw returns model names like "anthropic/claude-sonnet-4-5-20250929" but cost calculator expects "claude-sonnet-4-5-20250929" (no prefix). Cost was 0.
- **Fix:** Added `stripProviderPrefix()` helper that removes the provider prefix before passing to `calculateCost()`
- **Files modified:** packages/backend/src/services/ai/draft-generator.ts
- **Verification:** Happy path test passes with costEur > 0
- **Committed in:** cf04619

**2. [Rule 1 - Bug] Fixed import path in BullMQ job processor**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** Dynamic import used `../../services/ai/index.js` but correct relative path from `services/queue/jobs/` is `../../ai/index.js`
- **Fix:** Changed import path to `../../ai/index.js` (consistent with email-poll.job.ts pattern)
- **Files modified:** packages/backend/src/services/queue/jobs/ai-draft.job.ts
- **Verification:** `tsc --noEmit` passes
- **Committed in:** cf04619

**3. [Rule 1 - Bug] Fixed Logger type incompatibility**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** `Logger` from pino is not assignable from `FastifyBaseLogger` (missing `msgPrefix` property)
- **Fix:** Changed import to `FastifyBaseLogger` from fastify, which is what Fastify's `app.log.child()` returns
- **Files modified:** packages/backend/src/services/ai/draft-generator.ts
- **Verification:** `tsc --noEmit` passes
- **Committed in:** cf04619

---

**Total deviations:** 3 auto-fixed (3 bug fixes)
**Impact on plan:** All fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required. OpenClaw Gateway environment variables were configured in Plan 01.

## Next Phase Readiness
- AI Communication Engine (Phase 4) is now complete across all 3 plans
- Full pipeline: BullMQ job -> createAiModule -> generateDraft -> context builder + OpenClaw HTTP API + classifier + cost calculator -> DB write
- No direct LLM SDK imports anywhere -- all AI calls route through OpenClaw Gateway
- ARCH-03 interface boundary satisfied: email module -> BullMQ queue -> ai-draft job -> AiModuleContract -> OpenClaw -> agent API -> DB
- 79 tests covering the entire AI layer (classifier, context builder, draft generator)
- Ready for email pipeline integration to trigger AI draft jobs on new guest emails

## Self-Check: PASSED

All created files verified present. Both task commits (55a1adb, cf04619) verified in git log.

---
*Phase: 04-ai-communication-engine*
*Completed: 2026-02-20*
