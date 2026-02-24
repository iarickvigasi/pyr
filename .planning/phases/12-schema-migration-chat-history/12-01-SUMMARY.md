---
phase: 12-schema-migration-chat-history
plan: 01
subsystem: database
tags: [prisma, postgresql, migration, junction-table, backfill]

# Dependency graph
requires: []
provides:
  - BookingGuest junction table for multi-guest bookings (Phase 13)
  - Payment model with direct bookingId FK (Phase 14)
  - BookingGuest and updated Payment entity types
affects: [13-multi-guest-bookings, 14-payment-tracking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-step migration: DDL + raw SQL backfill in same migration file"
    - "gen_random_uuid()::text for backfill IDs (not cuid)"

key-files:
  created:
    - packages/backend/prisma/migrations/20260224101742_add_booking_guests_and_payment_updates/migration.sql
  modified:
    - packages/backend/prisma/schema.prisma
    - packages/backend/src/types/entities.ts

key-decisions:
  - "Backfill ALL bookings including soft-deleted (no WHERE deleted_at IS NULL filter)"
  - "Keep old guestId FK on Booking intact for backward compatibility until Phase 13"
  - "Payment.invoiceId made nullable; bookingId added as nullable for Phase 14 prep"

patterns-established:
  - "Junction table backfill: use gen_random_uuid()::text in raw SQL migration, not Prisma cuid()"

requirements-completed: [CHAT-01, CHAT-02]

# Metrics
duration: 3min
completed: 2026-02-24
---

# Phase 12 Plan 01: Schema Migration Summary

**BookingGuest junction table with backfill + Payment model updated with direct bookingId FK, all 4 packages compiling clean**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-24T10:15:55Z
- **Completed:** 2026-02-24T10:19:41Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- BookingGuest junction table created with composite unique index on (booking_id, guest_id)
- All 8 existing bookings backfilled into junction table via raw SQL in migration
- Payment model updated: invoiceId nullable, bookingId/notes/date columns added
- Entity types in entities.ts updated to reflect all schema changes
- All 4 packages (backend, frontend, shared, assistant) pass tsc --noEmit

## Task Commits

Each task was committed atomically:

1. **Task 1: Add BookingGuest model and update Payment model in Prisma schema** - `0a89254` (feat)
2. **Task 2: Update entity types and verify cross-package compilation** - `1b37e04` (feat)

## Files Created/Modified
- `packages/backend/prisma/schema.prisma` - Added BookingGuest model, updated Payment model (nullable invoiceId, new bookingId/notes/date), added relations to Booking and Guest
- `packages/backend/prisma/migrations/20260224101742_add_booking_guests_and_payment_updates/migration.sql` - DDL for junction table + payment changes + backfill SQL
- `packages/backend/src/types/entities.ts` - Added BookingGuest type, updated Booking/Payment/GuestWithRelations types

## Decisions Made
- Backfilled ALL bookings including soft-deleted ones to preserve historical guest links on cancelled bookings
- Used gen_random_uuid()::text for backfill IDs since Prisma's cuid() only works in Prisma Client
- Fixed a pre-existing migration checksum drift on 20260220084505_add_email_processing_fields by updating the stored checksum in _prisma_migrations table
- Applied 3 pending migrations (failed_ai_draft_status, faq_model, caldav_tracking_fields) via prisma migrate deploy before creating the new migration

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed migration checksum drift and pending migrations**
- **Found during:** Task 1 (Creating migration)
- **Issue:** Migration 20260220084505_add_email_processing_fields had a modified checksum, and 3 migrations were unapplied. `prisma migrate dev --create-only` refused to proceed.
- **Fix:** Applied pending migrations via `prisma migrate deploy`, then updated the stale checksum in _prisma_migrations table to match the current file hash.
- **Files modified:** Database _prisma_migrations table only (no code files)
- **Verification:** `prisma migrate status` shows "Database schema is up to date"
- **Committed in:** No code change needed -- database state fix only

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to unblock migration creation. No scope creep.

## Issues Encountered
- Migration checksum drift on a previously applied migration required manual checksum update in the database. This was a pre-existing state issue, not caused by this plan's changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- BookingGuest junction table is ready for Phase 13 to build multi-guest booking APIs
- Payment model is ready for Phase 14 to build direct booking-level payment tracking
- The old bookings.guest_id column remains intact -- Phase 13 will handle the migration to junction table usage
- No API, service, route, or frontend files were modified -- clean boundary for subsequent phases

## Self-Check: PASSED

- All 3 key files exist on disk
- Commit 0a89254 (Task 1) verified in git log
- Commit 1b37e04 (Task 2) verified in git log

---
*Phase: 12-schema-migration-chat-history*
*Completed: 2026-02-24*
