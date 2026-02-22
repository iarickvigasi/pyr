---
phase: 08-assistant-actions-automation
plan: 02
subsystem: notifications, queue, assistant
tags: [bullmq, webhooks, whatsapp, openclaw, cron, scheduled-jobs]

# Dependency graph
requires:
  - phase: 01-queue-module-foundation
    provides: BullMQ queue infrastructure, scheduled queue with placeholder processor, upsertJobScheduler pattern
  - phase: 07-openclaw-assistant-core
    provides: OpenClaw Gateway with hooks system, WhatsApp channel configuration, plugin SDK
provides:
  - Notification service with hook delivery to OpenClaw Gateway
  - Morning briefing processor with configurable schedule (default 07:30 Europe/Nicosia)
  - Guest arrival alert processor (morning of arrival day)
  - Overdue invoice alert processor (daily 09:00 check)
  - Event-driven new-booking and draft-ready WhatsApp notifications
  - OpenClaw hook mappings for briefing and alert delivery to WhatsApp
affects: [09-testing-migration-launch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Best-effort hook delivery: notifications log errors but never throw to avoid blocking primary operations"
    - "BullMQ cron with tz option for Europe/Nicosia timezone-aware scheduling"
    - "Dynamic import in job processors to avoid circular deps with notification service"
    - "Fire-and-forget pattern: .catch() on promise for non-blocking alert delivery in route handlers"

key-files:
  created:
    - packages/backend/src/modules/notifications/notification.service.ts
    - packages/backend/src/modules/notifications/notification.types.ts
  modified:
    - packages/shared/src/types/jobs.ts
    - packages/backend/src/services/queue/jobs/scheduled.job.ts
    - packages/backend/src/services/queue/worker.ts
    - packages/backend/src/services/queue/jobs/ai-draft.job.ts
    - packages/backend/src/modules/bookings/booking.routes.ts
    - openclaw/openclaw.json

key-decisions:
  - "BullMQ tz option for cron timezone instead of manual UTC conversion -- cleaner, handles DST automatically"
  - "Guest arrival scheduler runs 5 minutes after morning briefing for natural morning flow"
  - "Overdue invoice heuristic: checked_out bookings with totalPrice > 0, checked out > 7 days ago (no payment model queries needed for MVP)"
  - "Dynamic import for notification service in job processors to avoid circular dependency"

patterns-established:
  - "Hook delivery pattern: sendViaHook(app, hookPath, message) with best-effort semantics"
  - "Alert formatter pattern: formatAlert(alertType, details) switch-based message generation"
  - "Fire-and-forget alert wiring in route handlers: fn(app, id).catch(err => log)"

requirements-completed: [ASST-06, ASST-07]

# Metrics
duration: 4min
completed: 2026-02-22
---

# Phase 8 Plan 2: Notifications & Briefing Infrastructure Summary

**Morning briefing scheduler, 5 alert type formatters, OpenClaw hook delivery for WhatsApp notifications with configurable cron scheduling in Europe/Nicosia timezone**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-22T17:59:50Z
- **Completed:** 2026-02-22T18:04:30Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Notification service with 8 exported functions: hook delivery, briefing builder, 5 alert formatters, 3 batch processors, 2 event-driven triggers
- Scheduled processor placeholder fully replaced with real dispatcher for morning-briefing, guest-arrival-alert, overdue-invoice-alert
- Three BullMQ schedulers with Europe/Nicosia timezone: morning briefing (configurable, default 07:30), guest arrival (07:35), overdue invoice (09:00)
- Event-driven alerts wired: new booking creation triggers immediate WhatsApp alert, AI draft completion triggers draft-ready notification
- OpenClaw hook config updated with briefing and alert mappings for WhatsApp delivery

## Task Commits

Each task was committed atomically:

1. **Task 1: Create notification service with hook delivery, briefing builder, and alert formatters** - `5d7f34b` (feat)
2. **Task 2: Replace scheduled processor placeholder, set up briefing scheduler, wire alerts into mutations, and update OpenClaw hook config** - `57fc2b5` (feat)

## Files Created/Modified
- `packages/backend/src/modules/notifications/notification.types.ts` - AlertType, BriefingData, HookPayload type definitions
- `packages/backend/src/modules/notifications/notification.service.ts` - Hook delivery, briefing/alert formatters, morning briefing/guest arrival/overdue invoice processors, new-booking and draft-ready triggers
- `packages/shared/src/types/jobs.ts` - Renamed pre-arrival-reminder to guest-arrival-alert in ScheduledJobData union
- `packages/backend/src/services/queue/jobs/scheduled.job.ts` - Replaced placeholder with real dispatcher to notification service processors
- `packages/backend/src/services/queue/worker.ts` - Added 3 new BullMQ schedulers with Europe/Nicosia timezone cron patterns
- `packages/backend/src/services/queue/jobs/ai-draft.job.ts` - Added sendDraftReadyNotification call after successful draft generation
- `packages/backend/src/modules/bookings/booking.routes.ts` - Added fire-and-forget sendNewBookingAlert after booking creation
- `openclaw/openclaw.json` - Added briefing and alert hook mappings for WhatsApp delivery

## Decisions Made
- Used BullMQ's `tz` option in `upsertJobScheduler` for Europe/Nicosia timezone-aware cron scheduling instead of manual UTC conversion -- cleaner approach that handles DST transitions automatically
- Guest arrival scheduler runs 5 minutes after morning briefing (07:35 by default) for natural morning notification flow
- Overdue invoice detection uses simplified heuristic: bookings with status `checked_out`, `totalPrice > 0`, checked out more than 7 days ago -- no payment model queries needed since payment service is Phase 2
- Dynamic import (`await import()`) used for notification service in job processors to avoid circular dependency, consistent with existing email-poll and ai-draft patterns
- Renamed `pre-arrival-reminder` to `guest-arrival-alert` in shared types for consistency with alert naming conventions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed incorrect relative import paths in job processors**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** Plan specified `../../modules/notifications/notification.service.js` but correct path from `services/queue/jobs/` to `modules/notifications/` is `../../../modules/notifications/notification.service.js`
- **Fix:** Changed both dynamic import paths in scheduled.job.ts and ai-draft.job.ts to use correct `../../../` prefix
- **Files modified:** packages/backend/src/services/queue/jobs/scheduled.job.ts, packages/backend/src/services/queue/jobs/ai-draft.job.ts
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** 57fc2b5 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Path correction was necessary for compilation. No scope creep.

## Issues Encountered
- Shared package needed rebuild (`pnpm build`) after updating `ScheduledJobData` type to propagate the `guest-arrival-alert` type change to the backend's compiled type references

## User Setup Required
None - no external service configuration required. OpenClaw hook token and gateway URL are already configured via existing environment variables.

## Next Phase Readiness
- Phase 8 notification infrastructure complete -- morning briefing, 4 proactive alert types, and OpenClaw hook delivery all wired
- Backend scheduled processor is now fully functional (no more placeholder)
- Ready for Phase 9 (testing, migration, launch) which can exercise the full notification pipeline

## Self-Check: PASSED

All 8 files verified present. Both task commits (5d7f34b, 57fc2b5) verified in git history.

---
*Phase: 08-assistant-actions-automation*
*Completed: 2026-02-22*
