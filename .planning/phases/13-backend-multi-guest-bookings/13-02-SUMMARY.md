---
phase: 13-backend-multi-guest-bookings
plan: 02
subsystem: api
tags: [prisma, caldav, notifications, dashboard, ai-context, email, guest-merge, junction-table]

# Dependency graph
requires:
  - phase: 13-backend-multi-guest-bookings
    provides: Booking CRUD rewrite with guestIds[], junction table management, BookingWithRelations type
provides:
  - CalDAV booking events display all guest names (comma-joined from junction table)
  - Notification alerts format multi-guest names (A & B for 2, A + N others for 3+)
  - Dashboard today returns guestNames[] array per check-in/check-out booking
  - AI context builder finds bookings for secondary guests via junction query
  - Agent service queries bookings via junction table for conversation and guest context
  - OTA auto-created bookings write BookingGuest junction row in same transaction
  - Guest merge handles bookingGuests deduplication (delete shared, reassign rest)
  - formatGuestNames helper for consistent multi-guest display
affects: [15-frontend-multi-guest, 16-assistant-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [multi-guest-name-formatting, junction-table-fallback-pattern]

key-files:
  created: []
  modified:
    - packages/backend/src/services/caldav/ical-builder.ts
    - packages/backend/src/services/caldav/caldav.service.ts
    - packages/backend/src/modules/notifications/notification.service.ts
    - packages/backend/src/modules/dashboard/dashboard.service.ts
    - packages/backend/src/modules/dashboard/dashboard.schema.ts
    - packages/backend/src/services/ai/context-builder.ts
    - packages/backend/src/modules/agent/agent.service.ts
    - packages/backend/src/services/email/index.ts
    - packages/backend/src/modules/guests/guest.service.ts
    - packages/backend/src/services/caldav/__tests__/ical-builder.test.ts
    - packages/backend/src/services/caldav/__tests__/caldav-integration.test.ts

key-decisions:
  - "Dashboard guestName->guestNames is a clean break (no backward compat shim) -- Phase 15 frontend update needed"
  - "CalDAV and notification services use fallback to legacy booking.guest when bookingGuests is empty for safety"
  - "formatGuestNames uses & for 2 guests and + N others for 3+ (compact for WhatsApp alerts)"
  - "Guest merge deduplicates junction: delete shared bookings first, then reassign remaining"

patterns-established:
  - "Multi-guest name formatting: 1='Name', 2='A & B', 3+='A + N others'"
  - "Junction fallback: check bookingGuests.length > 0 before using junction, fall back to legacy guest FK"

requirements-completed: [MBOOK-01, MBOOK-03, MBOOK-04]

# Metrics
duration: 6min
completed: 2026-02-24
---

# Phase 13 Plan 02: Downstream Callsite Updates for Multi-Guest Bookings Summary

**All 9 downstream consumers updated to use bookingGuests junction table -- CalDAV shows all guest names, notifications format multi-guest alerts, AI context finds secondary guest bookings, OTA writes junction rows, guest merge deduplicates**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-24T11:15:28Z
- **Completed:** 2026-02-24T11:21:15Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- CalDAV ical-builder accepts guestNames[] array and joins for calendar event titles ("Anna Schmidt, Max Muller -- Suite Room")
- All three notification alert functions (new-booking, guest-arriving, overdue-invoice) format multi-guest names with new formatGuestNames helper
- Dashboard today endpoint returns guestNames[] array instead of single guestName string
- AI context-builder and agent service query bookings via junction table, finding secondary guest bookings
- OTA booking auto-creation writes BookingGuest junction row in the same transaction
- Guest merge handles junction table deduplication: removes shared booking entries, reassigns remaining
- All 34 booking tests pass, backend/shared/assistant/frontend compile clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Update CalDAV, notifications, and dashboard to use bookingGuests** - `cd21bff` (feat)
2. **Task 2: Update AI context builders, OTA email creation, and guest merge for junction table** - `8c63325` (feat)
3. **Task 3: Cross-package compilation and final verification** - verification only, no code changes

## Files Created/Modified
- `packages/backend/src/services/caldav/ical-builder.ts` - Changed BookingVeventParams.guestName to guestNames[], joins array for title
- `packages/backend/src/services/caldav/caldav.service.ts` - Loads bookingGuests relation, derives guestNames and primaryGuest from junction
- `packages/backend/src/modules/notifications/notification.service.ts` - Added formatGuestNames helper, all 3 alert functions load bookingGuests
- `packages/backend/src/modules/dashboard/dashboard.service.ts` - TodayBooking.guestName->guestNames, queries load bookingGuests relation
- `packages/backend/src/modules/dashboard/dashboard.schema.ts` - guestName->guestNames (z.array(z.string())) with Phase 15 comment
- `packages/backend/src/services/ai/context-builder.ts` - buildDraftContext queries bookings via bookingGuests.some
- `packages/backend/src/modules/agent/agent.service.ts` - getConversationContext and getGuestContext use junction queries
- `packages/backend/src/services/email/index.ts` - OTA booking creation adds bookingGuest.create in transaction
- `packages/backend/src/modules/guests/guest.service.ts` - mergeGuests handles bookingGuest dedup + reassignment
- `packages/backend/src/services/caldav/__tests__/ical-builder.test.ts` - Updated test helper to use guestNames[]
- `packages/backend/src/services/caldav/__tests__/caldav-integration.test.ts` - Updated all 7 test fixtures to use guestNames[]

## Decisions Made
- Dashboard `guestName` -> `guestNames` is a clean break with no backward compat shim -- frontend will show TS errors that Phase 15 fixes (noted with comment in schema)
- CalDAV and notification services include fallback to legacy `booking.guest` when `bookingGuests` is empty for safety during transition
- `formatGuestNames` uses "&" for 2 guests and "+ N others" for 3+ (compact format for WhatsApp/Telegram alerts)
- Guest merge deduplication ordering: delete shared bookings first (avoid unique constraint violation), then reassign remaining

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated CalDAV test files for guestNames parameter**
- **Found during:** Task 1 (tsc verification)
- **Issue:** ical-builder.test.ts and caldav-integration.test.ts used old `guestName: string` parameter which no longer exists
- **Fix:** Changed `guestName: 'Name'` to `guestNames: ['Name']` across both test files (8 locations total)
- **Files modified:** packages/backend/src/services/caldav/__tests__/ical-builder.test.ts, packages/backend/src/services/caldav/__tests__/caldav-integration.test.ts
- **Verification:** tsc --noEmit passes clean
- **Committed in:** cd21bff (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test files needed to match the interface change. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All backend multi-guest booking work complete (Phase 13 done)
- Ready for Phase 14: Backend Payment Tracking (independent of Phase 13)
- Ready for Phase 15: Frontend Multi-Guest & Payments (depends on both Phase 13 and 14)
- Frontend dashboard page references `guestName` (single string) -- will be updated in Phase 15 to use `guestNames[]` array
- Legacy `guestId` column still populated with guestIds[0] -- safe for column removal after Phase 15

---
*Phase: 13-backend-multi-guest-bookings*
*Completed: 2026-02-24*
