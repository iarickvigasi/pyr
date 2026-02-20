---
phase: 06-caldav-calendar-sync
plan: 02
subsystem: calendar
tags: [caldav, tsdav, ical-generator, bullmq, calendar-sync, apple-calendar]

# Dependency graph
requires:
  - phase: 06-caldav-calendar-sync
    provides: CalDAV client wrapper (tsdav), iCalendar VEVENT builders, CalendarEvent model with tracking fields
  - phase: 01-queue-module-foundation
    provides: BullMQ queue infrastructure, CalendarSyncJobData type, CalendarModuleContract interface
provides:
  - CalDAV sync service with create/update/cancel for bookings and standalone events
  - BullMQ calendar-sync job processor dispatching to sync functions by entity type
  - CalendarModuleContract fully implemented (no more placeholder stubs)
  - Booking and event route handlers wired to enqueue calendar sync jobs on every mutation
affects: [06-caldav-calendar-sync, booking-routes, event-routes, calendar-sync-job-processor]

# Tech tracking
tech-stack:
  added: []
  patterns: [caldav-sync-service-create-update-cancel, route-handler-sync-enqueueing, synchronous-delete-sync-for-cascade]

key-files:
  created: []
  modified:
    - packages/backend/src/services/caldav/caldav.service.ts
    - packages/backend/src/services/caldav/index.ts
    - packages/backend/src/services/queue/jobs/calendar-sync.job.ts
    - packages/backend/src/modules/bookings/booking.routes.ts
    - packages/backend/src/modules/events/event.routes.ts

key-decisions:
  - "Sync job enqueueing in route handlers (not services) to keep services pure -- same pattern as AI draft enqueueing"
  - "Event DELETE syncs [CANCELLED] to calendar synchronously before hard-delete (DB cascade prevents async BullMQ approach)"
  - "Response etag extracted from native Fetch Response headers; caldavUrl constructed deterministically from calendar URL + filename"
  - "Payment status uses simple heuristic (totalPrice > 0 = Unpaid) for MVP -- no payment model queries"

patterns-established:
  - "CalDAV sync service pattern: load entity with relations, build VEVENT from current DB data, create or update via tsdav, track syncStatus/etag/sequence in CalendarEvent"
  - "Route-handler calendar sync enqueueing: try/catch wrapped BullMQ add after service call, never blocks primary operation"
  - "Synchronous pre-delete sync: for entities with cascade-deleting CalendarEvent records, sync [CANCELLED] before DB delete"

requirements-completed: [CAL-01, CAL-02, CAL-04, CAL-05]

# Metrics
duration: 9min
completed: 2026-02-20
---

# Phase 6 Plan 2: CalDAV Sync Engine & Mutation Hooks Summary

**CalDAV sync engine with create/update/cancel operations for bookings and events, BullMQ job processor dispatch, and booking/event route mutation hooks enqueuing sync jobs**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-20T19:05:55Z
- **Completed:** 2026-02-20T19:14:36Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- CalDAV sync service fully implements create, update, and cancel for both bookings and standalone events with CalendarEvent tracking (caldavUid, caldavUrl, etag, syncStatus, sequence)
- CalendarModuleContract replaced placeholder stubs with real implementations -- syncBooking, syncEvent, and healthCheck all operational
- BullMQ calendar-sync job processor dispatches to sync functions by entity type with lazy module initialization
- All booking mutations (create, update, cancel) and event mutations (create, update, delete, guest registration) trigger background calendar sync

## Task Commits

Each task was committed atomically:

1. **Task 1: CalDAV sync service and job processor** - `704ede5` (feat)
2. **Task 2: Wire booking and event mutations to enqueue CalDAV sync jobs** - `4b987f5` (feat)

## Files Created/Modified
- `packages/backend/src/services/caldav/caldav.service.ts` - Core sync operations: syncBookingToCalendar, syncEventToCalendar with create/update/cancel logic
- `packages/backend/src/services/caldav/index.ts` - CalendarModuleContract implementation replacing the placeholder
- `packages/backend/src/services/queue/jobs/calendar-sync.job.ts` - Real job processor dispatching to sync functions by entity type
- `packages/backend/src/modules/bookings/booking.routes.ts` - Calendar sync job enqueueing after booking create/update/cancel
- `packages/backend/src/modules/events/event.routes.ts` - Calendar sync job enqueueing after event create/update/delete and guest registration

## Decisions Made
- Sync job enqueueing placed in route handlers (not service layer) to keep services pure and avoid adding queue dependencies -- consistent with AI draft enqueueing pattern from Phase 5
- Event DELETE handles calendar sync synchronously before calling deleteEvent because the hard-delete cascades to CalendarEvent records, making async BullMQ approach impossible
- CalDAV response etag extracted from native Fetch Response headers (`response.headers.get('etag')`); calendar event URL constructed deterministically from `calendar.url + uid + .ics`
- Payment status uses simple heuristic (`totalPrice > 0 ? 'Unpaid' : 'N/A'`) for MVP rather than querying payment records

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Event DELETE calendar sync handled synchronously instead of via BullMQ**
- **Found during:** Task 2 (Wire event mutations)
- **Issue:** The plan specified enqueuing a BullMQ job after deleteEvent, but deleteEvent hard-deletes the Event and cascade-deletes CalendarEvent records. By the time the async worker processes the job, both the event data and CalendarEvent records are gone.
- **Fix:** For event DELETE only, the route handler calls syncEventToCalendar synchronously (wrapped in try/catch) BEFORE deleteEvent, ensuring the [CANCELLED] update reaches Apple Calendar while the data still exists.
- **Files modified:** packages/backend/src/modules/events/event.routes.ts
- **Verification:** TypeScript compiles, all 44 booking+event tests pass
- **Committed in:** 4b987f5 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix -- without it, event deletions would silently fail to update Apple Calendar. No scope creep.

## Issues Encountered
- tsdav's `createCalendarObject` returns a native Fetch API `Response` type, not a plain object -- initial code used `as Record<string, unknown>` which TypeScript rejected. Fixed by using `response.headers.get('etag')` and constructing the URL deterministically.

## User Setup Required

None - no external service configuration required for this plan. CalDAV credentials will be configured in Plan 03 via the admin settings UI.

## Next Phase Readiness
- CalDAV sync engine fully operational for create/update/cancel on both bookings and events
- All booking and event mutations trigger background (or synchronous for event delete) calendar sync
- Ready for Plan 03: Calendar API endpoints, CalDAV settings UI, and sync status banner
- Ready for Plan 04: Integration tests with real iCloud account

## Self-Check: PASSED

All files verified present. All commits verified in git log.

---
*Phase: 06-caldav-calendar-sync*
*Completed: 2026-02-20*
