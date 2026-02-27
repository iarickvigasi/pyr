---
phase: 18-ai-draft-pipeline-fix
plan: 01
subsystem: api
tags: [bullmq, websocket, ai-draft, logging, fastify]

# Dependency graph
requires:
  - phase: 05-ai-email-integration
    provides: AI draft generation pipeline (email -> classify -> enqueue -> generate -> store)
provides:
  - Fixed dedup check that no longer blocks retries after failed drafts
  - Chat event accumulation timeout (90s) preventing indefinite job hangs
  - Gateway connection pre-check with clear error message
  - Enhanced pipeline logging at all silent failure points
  - Manual draft generation endpoint POST /conversations/:id/drafts/generate
affects: [18-02-ai-draft-pipeline-fix, 22-whatsapp-email-notifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Chat event promise timeout pattern with settled flag for safe cleanup"
    - "503 AppError for infrastructure unavailability (queue not registered)"

key-files:
  created: []
  modified:
    - packages/backend/src/services/queue/jobs/ai-draft.job.ts
    - packages/backend/src/services/ai/draft-generator.ts
    - packages/backend/src/services/email/index.ts
    - packages/backend/src/modules/inbox/inbox.routes.ts
    - packages/backend/src/modules/inbox/conversation.service.ts
    - packages/backend/src/modules/inbox/inbox.schema.ts

key-decisions:
  - "Dedup check only blocks on 'pending' drafts, not 'failed' -- failed drafts should be retryable without manual cleanup"
  - "90-second chat event timeout is separate from the 120s Gateway RPC timeout -- covers the streaming phase after acknowledgment"
  - "Used 'create' AuditAction for manual generate trigger since the enum only supports create/update/delete"

patterns-established:
  - "Settled flag pattern: use a boolean `settled` to guard against race conditions when timeout, chat events, and gateway.request().catch() can all settle the same promise"

requirements-completed: [DRAFT-01]

# Metrics
duration: 7min
completed: 2026-02-27
---

# Phase 18 Plan 01: AI Draft Pipeline Fix Summary

**Fixed three root-cause bugs in AI draft pipeline (dedup, timeout, gateway pre-check) and added manual draft trigger endpoint with enhanced diagnostic logging**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-27T20:04:46Z
- **Completed:** 2026-02-27T20:11:57Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Fixed dedup check that was blocking retries after failed drafts (changed from `status IN ['pending','failed']` to `status = 'pending'`)
- Added 90-second timeout on chat event accumulation to prevent indefinite job hangs when Gateway fails to emit final/error events
- Added explicit Gateway connection pre-check before draft generation with clear error message
- Enhanced logging at all 5 pipeline hand-off points: classification gate, guest matching gate, queue availability, AI module init, and gateway connection status
- Added `POST /api/v1/conversations/:id/drafts/generate` endpoint for manual draft triggering without waiting for email poll cycle

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix dedup check, add chat event timeout, and enhance pipeline logging** - `ea8eefb` (fix)
2. **Task 2: Add manual draft generation endpoint** - `69bb242` (feat)

## Files Created/Modified
- `packages/backend/src/services/queue/jobs/ai-draft.job.ts` - Fixed dedup to only match pending status; added AI module init and gateway status logging
- `packages/backend/src/services/ai/draft-generator.ts` - Added CHAT_EVENT_TIMEOUT_MS (90s), settled flag pattern, gateway connection pre-check
- `packages/backend/src/services/email/index.ts` - Added logging for non-inquiry classification, missing guest, and missing queue
- `packages/backend/src/modules/inbox/inbox.routes.ts` - Registered POST /:id/drafts/generate endpoint
- `packages/backend/src/modules/inbox/conversation.service.ts` - Added generateDraftForConversation function with queue lookup, audit logging
- `packages/backend/src/modules/inbox/inbox.schema.ts` - Added generateDraftParamsSchema

## Decisions Made
- Dedup check only matches `status: 'pending'` (not 'failed') -- a failed draft should not block a new generation attempt. BullMQ handles job-level dedup; the DB dedup only prevents duplicate pending drafts.
- 90-second chat event timeout chosen to be shorter than the 120-second Gateway RPC timeout. The RPC timeout covers initial request acknowledgment; this timeout covers the subsequent streaming phase.
- Used `AuditAction.create` for the manual generate trigger since the Prisma enum only supports create/update/delete. Differentiated via `changes.trigger: 'manual_generate'`.
- Used 503 status code (via `AppError`) for queue unavailability rather than 400, since it represents a server-side infrastructure issue.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] AuditAction type mismatch**
- **Found during:** Task 2 (Manual draft generation endpoint)
- **Issue:** Plan specified `action: 'generate_triggered'` but the `AuditAction` Prisma enum only accepts `create`, `update`, `delete`
- **Fix:** Changed to `action: 'create'` with `changes.trigger: 'manual_generate'` for differentiation
- **Files modified:** packages/backend/src/modules/inbox/conversation.service.ts
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 69bb242 (Task 2 commit)

**2. [Rule 1 - Bug] ID schema format inconsistency**
- **Found during:** Task 2 (Schema definition)
- **Issue:** Plan specified `z.string().uuid()` but the project convention uses `z.string().min(1)` for all ID params (cuid format, not UUID)
- **Fix:** Changed to `z.string().min(1)` to match existing `idParamSchema` pattern
- **Files modified:** packages/backend/src/modules/inbox/inbox.schema.ts
- **Verification:** Consistent with all other ID schemas in the codebase
- **Committed in:** 69bb242 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs -- type mismatch and schema convention)
**Impact on plan:** Both fixes necessary for TypeScript compilation and project consistency. No scope creep.

## Issues Encountered
- 9 pre-existing test failures in 3 test files (assistant.test.ts, dashboard.test.ts, ota-calendar-sync.test.ts) unrelated to changes. Verified by running tests before and after changes -- same failures in both cases.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Pipeline bug fixes ready for end-to-end testing (requires running Gateway)
- Manual draft trigger endpoint enables testing without waiting for email poll
- Plan 18-02 (surface draft generation status/errors in inbox UI) can proceed immediately
- Phase 22 (WhatsApp draft approval) is unblocked once 18-02 completes

## Self-Check: PASSED

All 6 modified files exist. Both task commits (ea8eefb, 69bb242) verified in git log.

---
*Phase: 18-ai-draft-pipeline-fix*
*Completed: 2026-02-27*
