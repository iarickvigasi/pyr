---
phase: 14-backend-payment-tracking
plan: 01
subsystem: payments
tags: [prisma, fastify, zod, vitest, soft-delete, audit-log]

# Dependency graph
requires:
  - phase: 13-multi-guest-booking-rewrite
    provides: booking CRUD with multi-guest junction table
provides:
  - Payment CRUD endpoints (POST/DELETE/GET) nested under bookings
  - Payment soft-delete with deletedAt
  - createTestPayment test factory
affects: [14-02-PLAN, frontend-payment-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [nested sub-resource routes under parent prefix, booking lookup without deletedAt filter for cancelled-booking payments]

key-files:
  created:
    - packages/backend/src/modules/bookings/payment.schema.ts
    - packages/backend/src/modules/bookings/payment.service.ts
    - packages/backend/src/modules/bookings/payment.routes.ts
    - packages/backend/src/modules/bookings/payment.test.ts
    - packages/backend/prisma/migrations/20260224130823_drop_received_at_add_deleted_at/migration.sql
  modified:
    - packages/backend/prisma/schema.prisma
    - packages/backend/src/types/entities.ts
    - packages/shared/src/types/invoice.ts
    - packages/backend/src/app.ts
    - packages/backend/src/test/factories.ts

key-decisions:
  - "Keep paypal in PaymentMethod enum (removing PG enum values is fragile); Zod schema restricts input to bank_transfer and cash"
  - "Booking lookup for payments uses no deletedAt filter, allowing payments on cancelled bookings per business decision"

patterns-established:
  - "Sub-resource routes: register separate Fastify plugin under same parent prefix (e.g. paymentRoutes under /api/v1/bookings)"
  - "Soft-delete payments: deletedAt field + index, excluded from list queries"

requirements-completed: [PAY-01, PAY-06]

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 14 Plan 01: Payment CRUD Summary

**Payment CRUD endpoints (create, soft-delete, list) nested under bookings with Prisma migration, Zod schemas, audit logging, and 14 integration tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-24T13:07:01Z
- **Completed:** 2026-02-24T13:11:45Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Prisma migration: dropped `receivedAt`, added `deletedAt` + index to Payment model
- Full payment CRUD: POST creates, DELETE soft-deletes, GET lists (non-deleted, sorted by date desc)
- 14 integration tests all passing, covering create/delete/list, audit logging, edge cases
- Cancelled bookings accept payments per business decision (no deletedAt filter on booking lookup)

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma migration, entity types, payment schema and service** - `7574394` (feat)
2. **Task 2: Payment routes, registration, test factory, and integration tests** - `efaca7a` (feat)

## Files Created/Modified
- `packages/backend/prisma/schema.prisma` - Payment model: drop receivedAt, add deletedAt + index
- `packages/backend/prisma/migrations/20260224130823_drop_received_at_add_deleted_at/migration.sql` - Migration SQL
- `packages/backend/src/types/entities.ts` - Payment type: receivedAt -> deletedAt
- `packages/shared/src/types/invoice.ts` - Shared Payment interface updated with bookingId, notes, date, deletedAt
- `packages/backend/src/modules/bookings/payment.schema.ts` - Zod schemas for payment create and params
- `packages/backend/src/modules/bookings/payment.service.ts` - createPayment, deletePayment, listPayments
- `packages/backend/src/modules/bookings/payment.routes.ts` - Fastify plugin with GET/POST/DELETE
- `packages/backend/src/app.ts` - Register paymentRoutes under /api/v1/bookings prefix
- `packages/backend/src/test/factories.ts` - createTestPayment factory function
- `packages/backend/src/modules/bookings/payment.test.ts` - 14 integration tests

## Decisions Made
- Kept `paypal` in PaymentMethod enum (removing PostgreSQL enum values is fragile); Zod schema restricts input to `bank_transfer` and `cash` only
- Booking lookup for payments uses NO deletedAt filter, allowing payments on cancelled bookings per the locked user decision in CONTEXT.md
- No overpayment validation -- Ines can log any amount freely

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Global Prisma CLI v7 conflicted with local v6; resolved by using `pnpm exec prisma` to invoke local version
- DATABASE_URL not in backend .env; resolved by loading from root .env

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Payment CRUD endpoints ready for Phase 14-02 (balance calculation, paymentStatus, overdue alerts)
- createTestPayment factory available for downstream tests
- 34 existing booking tests still pass (no regressions)

---
*Phase: 14-backend-payment-tracking*
*Completed: 2026-02-24*
