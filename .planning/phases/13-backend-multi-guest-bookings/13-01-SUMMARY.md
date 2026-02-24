---
phase: 13-backend-multi-guest-bookings
plan: 01
subsystem: api
tags: [prisma, zod, fastify, bookings, junction-table, multi-guest]

# Dependency graph
requires:
  - phase: 12-schema-migration-chat-history
    provides: BookingGuest junction table with backfilled data, Prisma client regeneration
provides:
  - Booking CRUD accepts guestIds[] on POST and PATCH
  - Junction table managed atomically in transactions with diff strategy for updates
  - List endpoint filters via junction table (bookingGuests.some) for any-guest search
  - Detail endpoint includes bookingGuests with guest data
  - Legacy guestId column kept populated with guestIds[0] for backward compat
  - BookingGuestWithGuest and updated BookingWithRelations entity types
  - createTestBookingMultiGuest test factory helper
  - 7 multi-guest integration tests
affects: [13-02-downstream-callsites, 15-frontend-multi-guest, 16-assistant-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [junction-table-diff-strategy, backward-compat-schema-refine]

key-files:
  created: []
  modified:
    - packages/backend/src/modules/bookings/booking.schema.ts
    - packages/backend/src/modules/bookings/booking.service.ts
    - packages/backend/src/types/entities.ts
    - packages/backend/src/modules/bookings/booking.test.ts
    - packages/backend/src/test/factories.ts

key-decisions:
  - "Schema uses .refine() for guestIds/guestId mutual requirement instead of .transform() -- keeps type inference clean while validating at least one is provided"
  - "Normalization from guestId to guestIds done in service layer, not schema .transform() -- avoids ZodEffects type complications with Fastify type provider"
  - "Update uses Set-based diff strategy (toAdd/toRemove) rather than delete-all-recreate -- minimizes DB writes and preserves junction row IDs"
  - "bookingGuests made non-optional on BookingWithRelations -- all query paths now include it"

patterns-established:
  - "Junction table diff: load existing, compute Set diff, deleteMany removed + createMany added"
  - "Multi-guest validation: single findMany with count comparison, report missing IDs in error"

requirements-completed: [MBOOK-01, MBOOK-03]

# Metrics
duration: 8min
completed: 2026-02-24
---

# Phase 13 Plan 01: Booking CRUD Multi-Guest Rewrite Summary

**Booking API accepts guestIds[] on create/update, manages BookingGuest junction table in transactions, filters via junction for any-guest search, with full backward compat for legacy guestId**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-24T11:04:06Z
- **Completed:** 2026-02-24T11:12:32Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Booking CRUD fully rewritten to accept `guestIds[]` array with atomic junction table management
- Update endpoint uses efficient Set-based diff strategy (add new, remove old) instead of delete-all-recreate
- List endpoint filters by any guest on a booking via junction table `some` query
- All 34 booking tests pass (27 existing updated + 7 new multi-guest tests)
- Full backward compatibility: legacy `guestId` field still accepted on POST, column kept populated

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite booking schema, service, routes, and entity types** - `3d30004` (feat)
2. **Task 2: Update test factories and add multi-guest integration tests** - `79a2ba4` (test)

## Files Created/Modified
- `packages/backend/src/modules/bookings/booking.schema.ts` - Added guestIds[] to create/update schemas with .refine() validation
- `packages/backend/src/modules/bookings/booking.service.ts` - Junction table management in transactions, diff strategy for updates, junction-based filtering
- `packages/backend/src/types/entities.ts` - BookingGuestWithGuest type, BookingWithRelations with non-optional bookingGuests
- `packages/backend/src/modules/bookings/booking.test.ts` - Updated all payloads to guestIds[], added 7 multi-guest tests
- `packages/backend/src/test/factories.ts` - createTestBooking supports guestIds, added createTestBookingMultiGuest helper

## Decisions Made
- Schema uses `.refine()` for mutual guestIds/guestId requirement -- keeps type inference clean
- Normalization done in service layer rather than schema `.transform()` -- simpler integration with Fastify
- Set-based diff strategy for junction updates -- minimizes DB writes
- `bookingGuests` made non-optional on `BookingWithRelations` -- all query paths include it

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Applied pending migration to test database**
- **Found during:** Task 2 (running tests)
- **Issue:** Test database (`pyr_test`) did not have the `booking_guests` table from Phase 12 migration
- **Fix:** Ran `prisma migrate deploy` against test database URL
- **Files modified:** None (database migration only)
- **Verification:** All 34 tests pass after migration
- **Committed in:** N/A (database state change, not a code change)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Migration was necessary for tests to access junction table. No scope creep.

## Issues Encountered
None beyond the test database migration noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Booking CRUD layer fully supports multi-guest bookings
- Ready for 13-02: downstream callsite updates (CalDAV titles, notification formatting, dashboard guestNames, AI context builders, OTA junction writes, guest merge dedup)
- Legacy guestId column still populated -- safe for all non-migrated consumers

---
*Phase: 13-backend-multi-guest-bookings*
*Completed: 2026-02-24*
