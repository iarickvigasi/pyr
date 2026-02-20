---
phase: 05-ai-email-integration
plan: 01
subsystem: api
tags: [bullmq, email, ai-draft, smtp, fastify, prisma]

# Dependency graph
requires:
  - phase: 02-email-ingestion-pipeline
    provides: email poll pipeline with classification, SMTP service, email threading
  - phase: 04-ai-communication-engine
    provides: AI draft generator, OpenClaw integration, BullMQ ai-draft job processor
provides:
  - AI draft auto-generation wired into email pipeline for guest_inquiry emails
  - Per-message dedup in AI draft job processor
  - onFailed handler writing failed draft records for frontend detection
  - Approve endpoint (SMTP send + draft status update + outbound message)
  - Reject endpoint (draft status to rejected)
  - Regenerate endpoint (reject old draft + enqueue new AI draft job)
affects: [05-ai-email-integration, frontend-inbox-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [onFailed-handler-for-frontend-signaling, per-message-dedup]

key-files:
  created:
    - packages/backend/prisma/migrations/20260220172800_add_failed_ai_draft_status/migration.sql
  modified:
    - packages/backend/prisma/schema.prisma
    - packages/backend/src/services/email/index.ts
    - packages/backend/src/services/queue/jobs/ai-draft.job.ts
    - packages/backend/src/services/queue/worker.ts
    - packages/backend/src/modules/inbox/inbox.routes.ts
    - packages/backend/src/modules/inbox/inbox.schema.ts
    - packages/backend/src/modules/inbox/conversation.service.ts
    - packages/backend/src/types/entities.ts

key-decisions:
  - "SMTP send before transaction commit in approveDraft -- consistent with existing reply pattern, prevents stale draft status if send fails"
  - "Per-message dedup (not per-conversation) in AI draft job processor -- each inbound message gets its own draft"
  - "onFailed handler writes empty failed draft record -- frontend can detect and show failure notice to Ines"
  - "Draft enqueueing wrapped in try/catch so failures never block email processing"
  - "Regenerate rejects old draft and enqueues new job (no history kept per user decision)"

patterns-established:
  - "onFailed handler pattern: BullMQ Worker 'failed' event writes a status record for frontend signaling"
  - "Draft action endpoints follow /:id/drafts/:draftId/<action> URL pattern"

requirements-completed: [EMAIL-09, EMAIL-10]

# Metrics
duration: 9min
completed: 2026-02-20
---

# Phase 05 Plan 01: AI Draft Pipeline Wiring Summary

**AI draft auto-generation wired into email pipeline with approve/reject/regenerate REST endpoints and BullMQ failure signaling**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-20T17:28:42Z
- **Completed:** 2026-02-20T17:37:29Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Guest inquiry emails now automatically trigger AI draft generation via BullMQ job enqueue
- Per-message dedup ensures each inbound message gets its own draft (not per-conversation)
- Failed draft generation is signaled to frontend via 'failed' status records written by onFailed handler
- Three new REST endpoints handle the full draft lifecycle: approve (sends via SMTP), reject, regenerate

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 'failed' AiDraftStatus, wire AI draft enqueue, fix dedup, add onFailed handler** - `d0ebc06` (feat)
2. **Task 2: Add approve, reject, regenerate endpoints with service functions** - `6eff49d` (feat)

## Files Created/Modified
- `packages/backend/prisma/schema.prisma` - Added 'failed' to AiDraftStatus enum
- `packages/backend/prisma/migrations/20260220172800_add_failed_ai_draft_status/migration.sql` - DB migration for new enum value
- `packages/backend/src/services/email/index.ts` - AI draft job enqueue step after audit log in poll pipeline
- `packages/backend/src/services/queue/jobs/ai-draft.job.ts` - Per-message dedup, onFailed handler export
- `packages/backend/src/services/queue/worker.ts` - Register onFailed handler on AI draft worker
- `packages/backend/src/modules/inbox/inbox.schema.ts` - draftActionParamsSchema, approveDraftBodySchema
- `packages/backend/src/modules/inbox/conversation.service.ts` - approveDraft, rejectDraft, regenerateDraft service functions
- `packages/backend/src/modules/inbox/inbox.routes.ts` - Three new POST routes for draft actions
- `packages/backend/src/types/entities.ts` - Added 'failed' to AiDraftStatus type

## Decisions Made
- SMTP send before transaction commit in approveDraft -- consistent with existing manual reply pattern; if SMTP fails, draft stays pending
- Per-message dedup in AI draft job processor -- dedup query scoped to messageId + conversationId (not just conversationId)
- onFailed handler writes empty failed draft record (content='', model='none') for frontend detection
- Draft enqueue failure wrapped in try/catch -- never blocks email processing pipeline
- Regenerate rejects old draft and enqueues new BullMQ job (no history chain)
- Allow approve on 'failed' drafts as well as 'pending' -- enables retry after failure

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Prisma migrate dev requires DATABASE_URL (Docker not running) -- created manual migration SQL file instead
- Two pre-existing inbox test failures (missing input_tokens column in test DB from unapplied migration) -- not caused by this plan's changes

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Backend draft lifecycle fully functional, ready for frontend draft action UI (Plan 02)
- Draft generation pipeline end-to-end: email arrives -> classified -> job enqueued -> draft generated -> approve/reject/regenerate
- Failed draft signaling ready for frontend failure notices

## Self-Check: PASSED

All 9 files verified present. Both task commits (d0ebc06, 6eff49d) verified in git log.

---
*Phase: 05-ai-email-integration*
*Completed: 2026-02-20*
