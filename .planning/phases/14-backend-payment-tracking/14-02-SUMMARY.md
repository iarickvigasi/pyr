---
phase: 14-backend-payment-tracking
plan: 02
subsystem: payments
tags: [prisma, fastify, zod, vitest, groupBy, payment-status, overdue-alert]

# Dependency graph
requires:
  - phase: 14-backend-payment-tracking
    plan: 01
    provides: Payment CRUD endpoints, createTestPayment factory, Payment model with deletedAt
provides:
  - Booking detail with paymentSummary (totalPrice, totalPaid, balanceDue) and payments array
  - Booking list with computed paymentStatus (paid/partial/unpaid) and paymentStatus filter
  - Refactored overdue invoice alert using real payment balance via groupBy
affects: [frontend-payment-ui, 15-frontend-updates]

# Tech tracking
tech-stack:
  added: []
  patterns: [prisma.payment.groupBy for batch balance calculations, post-query computed field filtering]

key-files:
  created: []
  modified:
    - packages/backend/src/types/entities.ts
    - packages/backend/src/modules/bookings/booking.service.ts
    - packages/backend/src/modules/bookings/booking.schema.ts
    - packages/backend/src/modules/notifications/notification.service.ts
    - packages/backend/src/modules/bookings/payment.test.ts

key-decisions:
  - "paymentStatus is computed post-query via groupBy, not stored as a column -- keeps single source of truth in payments table"
  - "Overdue alert uses checkIn <= today instead of 7-day-after-checkout -- catches all bookings with outstanding balance from day of arrival"
  - "Overdue alert includes cancelled bookings -- per user decision, cancelled bookings with outstanding balance should still trigger alerts"
  - "paymentStatus filter is post-computation -- page size may be smaller than limit when filtering, acceptable for MVP"

patterns-established:
  - "Batch payment aggregation: prisma.payment.groupBy by bookingId with _sum for efficient balance calculation across multiple bookings"
  - "Computed enrichment pattern: DB query -> groupBy aggregation -> map/enrich -> optional filter"

requirements-completed: [PAY-05, PAY-07]

# Metrics
duration: 4min
completed: 2026-02-24
---

# Phase 14 Plan 02: Booking Payment Augmentation Summary

**Booking detail with paymentSummary/payments, list with computed paymentStatus, and overdue alert refactored to use real payment balance via groupBy**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-24T13:14:20Z
- **Completed:** 2026-02-24T13:18:24Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- GET /bookings/:id returns paymentSummary (totalPrice, totalPaid, balanceDue) and payments array
- GET /bookings returns computed paymentStatus per booking (paid/partial/unpaid) with optional filter
- processOverdueInvoiceAlert refactored from heuristic to real payment balance using groupBy
- 10 new integration tests covering payment summary, payment status, and PAY-05 totalPrice editing
- All 58 booking + payment tests pass, zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Augment booking detail and list with payment data** - `8efb93b` (feat)
2. **Task 2: Refactor overdue alert and add integration tests** - `9e95277` (feat)

## Files Created/Modified
- `packages/backend/src/types/entities.ts` - Added PaymentSummary, PaymentStatus types; extended BookingWithRelations
- `packages/backend/src/modules/bookings/booking.service.ts` - getBooking returns paymentSummary + payments; listBookings returns paymentStatus via groupBy
- `packages/backend/src/modules/bookings/booking.schema.ts` - Added paymentStatus filter to listBookingsQuerySchema
- `packages/backend/src/modules/notifications/notification.service.ts` - processOverdueInvoiceAlert uses real payment balance, covers all statuses
- `packages/backend/src/modules/bookings/payment.test.ts` - 10 new integration tests (24 total in file)

## Decisions Made
- paymentStatus is computed post-query via groupBy, not stored as a DB column -- keeps payments table as single source of truth
- Overdue alert now fires for bookings where checkIn <= today (removed old 7-day-after-checkout threshold)
- Overdue alert includes cancelled bookings per user decision -- cancelled bookings with outstanding balance still trigger alerts
- paymentStatus filter applies post-computation, so page size may be smaller than limit when filtering (acceptable for MVP)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 14 complete: Payment CRUD + booking augmentation + overdue alerts all use real payment data
- Frontend can now display paymentSummary on booking detail and paymentStatus on booking list
- 58 combined booking + payment integration tests provide solid regression coverage

## Self-Check: PASSED

All files found, all commits verified.

---
*Phase: 14-backend-payment-tracking*
*Completed: 2026-02-24*
