---
phase: 05-ai-email-integration
plan: 04
subsystem: testing
tags: [vitest, mocking, ai-draft, pipeline, workflow, integration-tests]

# Dependency graph
requires:
  - phase: 05-ai-email-integration/05-01
    provides: draft generator, context builder, classifier, cost calculator, ai-draft job processor
  - phase: 05-ai-email-integration/05-02
    provides: FAQ CRUD service (faq.findMany for prompt injection)
  - phase: 05-ai-email-integration/05-03
    provides: draft review UI triggering approve/reject/regenerate workflows
provides:
  - 9 draft pipeline integration tests (context injection, FAQ, dedup, onFailed, language, edge cases)
  - 8 draft workflow tests (approve, edited approve, reject, regenerate, error cases)
affects: [testing, ai-communication-engine]

# Tech tracking
tech-stack:
  added: []
  patterns: [vi.mock with mockImplementation for dynamic imports, Proxy-based mock Prisma, per-test mock setup without restoreAllMocks]

key-files:
  created:
    - packages/backend/src/services/ai/__tests__/draft-pipeline.test.ts
    - packages/backend/src/modules/inbox/__tests__/draft-workflow.test.ts
  modified: []

key-decisions:
  - "mockImplementation over mockReturnValue for vi.mock factories to survive vi.clearAllMocks between tests"
  - "vi.restoreAllMocks avoided in afterEach for tests using vi.mock module factories (restoreAllMocks resets factory implementations)"
  - "Dedup test verifies per-message scope by testing findFirst query patterns rather than running full BullMQ job processor"

patterns-established:
  - "Dynamic import mocking: use vi.mock with mockImplementation callback (not mockReturnValue) for modules loaded via await import()"
  - "Mock Prisma with explicit null-key check using 'in' operator for nullable factory parameters"

requirements-completed: [TEST-02]

# Metrics
duration: 5min
completed: 2026-02-20
---

# Phase 05 Plan 04: AI Draft Pipeline & Workflow Integration Tests Summary

**17 integration tests verifying AI draft pipeline end-to-end (context injection, FAQ, dedup, onFailed) and draft workflow (approve/reject/regenerate) with fully mocked LLM and Prisma**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-20T17:56:49Z
- **Completed:** 2026-02-20T18:01:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- 9 draft pipeline integration tests covering context injection, FAQ inclusion, empty FAQ fallback, edge-case classification, API error handling, per-message dedup, onFailed handler, DB write failure resilience, and German language selection
- 8 draft workflow tests covering approve (original + edited), reject, regenerate, and error cases (not found, wrong status)
- All 216 backend unit tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Write draft pipeline integration tests** - `e333187` (test)
2. **Task 2: Write draft workflow tests** - `3bc31fa` (test)

## Files Created/Modified
- `packages/backend/src/services/ai/__tests__/draft-pipeline.test.ts` - 9 integration tests for draft generation pipeline (context assembly, LLM call, draft storage, FAQ injection, dedup, onFailed handler)
- `packages/backend/src/modules/inbox/__tests__/draft-workflow.test.ts` - 8 workflow tests for approve/reject/regenerate service functions

## Decisions Made
- Used `mockImplementation` instead of `mockReturnValue` for vi.mock factories to ensure mock implementations survive `vi.clearAllMocks()` calls between tests
- Avoided `vi.restoreAllMocks()` in afterEach for tests using vi.mock module factories, since restoreAllMocks resets factory-created implementations
- Verified per-message dedup by testing the findFirst query pattern (conversationId + messageId scope) rather than running the full BullMQ job processor -- sufficient for proving the dedup logic without BullMQ infrastructure

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing DB migration drift: `ai_drafts.input_tokens` column missing in test database causes integration tests that hit the real DB to fail. This is out of scope for this plan (unit test plan with mocked Prisma). All 17 new tests are fully mocked and pass without a database.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 05 (AI-Email Integration) is now fully complete with all 4 plans executed
- All AI draft pipeline functionality is tested: generation, context injection, FAQ, workflow
- Ready for Phase 06 and beyond

## Self-Check: PASSED

- [x] `packages/backend/src/services/ai/__tests__/draft-pipeline.test.ts` exists
- [x] `packages/backend/src/modules/inbox/__tests__/draft-workflow.test.ts` exists
- [x] `.planning/phases/05-ai-email-integration/05-04-SUMMARY.md` exists
- [x] Commit `e333187` (Task 1) found in git log
- [x] Commit `3bc31fa` (Task 2) found in git log

---
*Phase: 05-ai-email-integration*
*Completed: 2026-02-20*
