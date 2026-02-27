---
phase: 18-ai-draft-pipeline-fix
plan: 02
subsystem: ui
tags: [react, tanstack-query, inbox, ai-draft, shadcn-ui]

# Dependency graph
requires:
  - phase: 18-ai-draft-pipeline-fix
    provides: POST /conversations/:id/drafts/generate endpoint for manual draft triggering
provides:
  - useGenerateDraft mutation hook for frontend draft generation
  - Generating spinner state in DraftCard and ConversationThread
  - Manual "Generate AI Draft" button for conversations without pending drafts
  - Failed draft retry wired to robust generate endpoint
affects: [22-whatsapp-email-notifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Internal hook pattern: ConversationThread owns useGenerateDraft internally rather than receiving callbacks from parent"
    - "Conditional UI rendering based on draft state (hasInboundMessage && !hasPendingDraft && !isPending)"

key-files:
  created: []
  modified:
    - packages/frontend/src/lib/hooks/use-conversations.ts
    - packages/frontend/src/components/features/inbox/draft-card.tsx
    - packages/frontend/src/components/features/inbox/conversation-thread.tsx
    - packages/frontend/src/components/features/inbox/inbox-page.tsx

key-decisions:
  - "ConversationThread manages draft generation internally via useGenerateDraft hook rather than delegating to parent via props -- simplifies parent component and keeps regeneration logic co-located"
  - "Failed draft retry uses the generate endpoint instead of the per-draft regenerate endpoint -- generate is more robust (finds latest inbound message, enqueues fresh)"
  - "Removed onRegenerateDraft and isRegeneratePending props from ConversationThread since regeneration is now handled internally"

patterns-established:
  - "Internal mutation hook pattern: components that need both display and mutation can own the mutation hook internally rather than threading callbacks through props"

requirements-completed: [DRAFT-02]

# Metrics
duration: 4min
completed: 2026-02-27
---

# Phase 18 Plan 02: Draft Generation UI Summary

**Inbox UI now shows generating spinner, manual "Generate AI Draft" button, and failed-draft retry wired to robust generate endpoint**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-27T20:15:23Z
- **Completed:** 2026-02-27T20:19:47Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `useGenerateDraft` mutation hook that calls `POST /api/v1/conversations/:id/drafts/generate` with query invalidation on success
- Added generating spinner state to `DraftCard` (new `isGenerating` prop) and inline spinner in `ConversationThread` while draft creation is in progress
- Added "Generate AI Draft" button at the end of conversation threads when conversation has inbound messages but no pending draft
- Wired failed draft retry buttons to use the more robust generate endpoint instead of the per-draft regenerate endpoint
- Simplified `inbox-page.tsx` by removing `useRegenerateDraft` usage and the `handleRegenerateDraft` handler (regeneration is now internal to `ConversationThread`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add useGenerateDraft mutation hook and generating state UI** - `d5c9615` (feat)
2. **Task 2: Verify end-to-end build and update frontend type alignment** - verification only, no code changes needed

## Files Created/Modified
- `packages/frontend/src/lib/hooks/use-conversations.ts` - Added useGenerateDraft mutation hook
- `packages/frontend/src/components/features/inbox/draft-card.tsx` - Added isGenerating prop and Loader2 spinner state
- `packages/frontend/src/components/features/inbox/conversation-thread.tsx` - Added generate button, generating spinner, internal useGenerateDraft hook, handleRegenerate wiring
- `packages/frontend/src/components/features/inbox/inbox-page.tsx` - Removed useRegenerateDraft import, handleRegenerateDraft handler, and regenerate-related props

## Decisions Made
- ConversationThread now owns draft generation internally via `useGenerateDraft` hook rather than receiving `onRegenerateDraft` callback from parent. This simplifies the parent component and keeps regeneration logic co-located with the UI that triggers it.
- Failed draft retry uses the `POST /:id/drafts/generate` endpoint instead of the per-draft `POST /:id/drafts/:draftId/regenerate` endpoint. The generate endpoint is more robust because it finds the latest inbound message and enqueues a fresh job, rather than requiring a specific draft ID.
- Removed `onRegenerateDraft`, `isRejectPending`, and `isRegeneratePending` props from ConversationThread interface since regeneration is handled internally and reject pending state was unused.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed unused parent-level regeneration plumbing**
- **Found during:** Task 1 (wiring generate button)
- **Issue:** Plan described wiring retry to `generateDraft.mutate()` through the parent component, but since `ConversationThread` now owns `useGenerateDraft` internally, the parent's `onRegenerateDraft` prop and `handleRegenerateDraft` handler became dead code
- **Fix:** Removed `useRegenerateDraft` import, `handleRegenerateDraft` handler, and `onRegenerateDraft`/`isRegeneratePending`/`isRejectPending` props from the component contract
- **Files modified:** inbox-page.tsx, conversation-thread.tsx
- **Verification:** TypeScript compiles cleanly, `pnpm build` passes
- **Committed in:** d5c9615 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (cleanup of dead code after internal hook pattern)
**Impact on plan:** Simplification that follows naturally from the plan's directive to wire retry to `generateDraft.mutate()`. No scope creep.

## Issues Encountered
- Pre-existing test failures in 4 test files (10 tests) unrelated to changes -- same failures reported in Plan 18-01 summary.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 18 (AI Draft Pipeline Fix) is now complete -- both backend fixes (18-01) and UI improvements (18-02) are shipped
- Phase 22 (WhatsApp email notifications) is unblocked
- Draft generation can be triggered manually via the UI button for testing without waiting for email poll cycle

## Self-Check: PASSED

All 4 modified files exist. Task commit (d5c9615) verified in git log.

---
*Phase: 18-ai-draft-pipeline-fix*
*Completed: 2026-02-27*
