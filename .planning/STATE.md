# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Ines can manage her entire business from one system -- see every guest, booking, and message in one place, get AI-drafted replies she approves with one tap, and control everything via the AI assistant.
**Current focus:** Phase 16 -- Assistant Integration

## Current Position

Phase: 16 (5 of 5 in v1.1) -- Assistant Integration
Plan: 0 of ?
Status: Not started
Last activity: 2026-02-24 -- Completed 15-03 (Booking detail multi-guest display, payment panel)

Progress: [#########.] 90% (9/10 plans across 5 phases)

## Performance Metrics

**Velocity (v1.0):**
- Total plans completed: 31
- Average duration: 6min
- Total execution time: 2.98 hours

**Velocity (v1.1):**
- Total plans completed: 9
- Average duration: 5min
- Total execution time: 0.61 hours

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
v1.0 decisions preserved -- see MILESTONES.md for full archive.

- Phase 12-01: Backfill ALL bookings including soft-deleted into junction table
- Phase 12-01: Used gen_random_uuid()::text for backfill IDs (Prisma cuid() unavailable in raw SQL)
- Phase 12-01: Payment.invoiceId made nullable for Phase 14 direct booking payments
- Phase 12-02: Counter-based session keys (dashboard:1, dashboard:2) replace timestamp-based for OpenClaw JSONL persistence
- Phase 12-02: resetSession fully client-side (no server call) -- backend endpoint kept for backward compat
- Phase 12-02: Messages saved to localStorage after each completed exchange (not per-chunk)
- Phase 13-01: Schema uses .refine() for guestIds/guestId mutual requirement (not .transform())
- Phase 13-01: Normalization guestId->guestIds done in service layer, not schema transform
- Phase 13-01: Set-based diff strategy for junction table updates (toAdd/toRemove)
- Phase 13-01: bookingGuests made non-optional on BookingWithRelations type
- Phase 13-02: Dashboard guestName->guestNames is clean break (no backward compat shim) -- Phase 15 frontend update needed
- Phase 13-02: CalDAV/notifications use fallback to legacy booking.guest when bookingGuests is empty
- Phase 13-02: formatGuestNames uses & for 2 guests and + N others for 3+
- Phase 13-02: Guest merge deduplicates junction: delete shared first, then reassign remaining
- [Phase 14]: Phase 14-01: Keep paypal in PaymentMethod enum; Zod restricts to bank_transfer and cash
- [Phase 14]: Phase 14-01: Booking lookup for payments has no deletedAt filter (cancelled bookings accept payments)
- [Phase 14]: Phase 14-02: paymentStatus computed post-query via groupBy, not stored as DB column
- [Phase 14]: Phase 14-02: Overdue alert uses checkIn <= today, covers all statuses including cancelled
- [Phase 14]: Phase 14-02: paymentStatus filter applies post-computation (page size may shrink when filtering)
- Phase 15-01: Used ReactElement instead of JSX.Element for return type (React 19 namespace change)
- Phase 15-01: Booking form dialog wraps guestId into guestIds[] on create path (bridge until Plan 15-02 multi-select)
- Phase 15-02: Multi-guest display in table uses first guest linked + "+ N others" for compactness
- Phase 15-02: Popover stays open during multi-select (no close on each selection)
- Phase 15-02: Payment status filter wired through URL search params for bookmark/share support
- Phase 15-03: Guest list falls back to legacy booking.guest when bookingGuests is empty (backward compat safety)
- Phase 15-03: PaymentPanel uses defensive defaults for paymentSummary prop

### Pending Todos

None yet.

### Research Flags

- Phase 12: Two-migration strategy for junction table (create+backfill, then drop old column)
- Phase 14: Verify zero existing payment rows before making invoiceId nullable
- Phase 14: processOverdueInvoiceAlert must be updated before first payment is logged (DONE in 14-02)

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-24
Stopped at: Completed 15-03-PLAN.md (Phase 15 complete)
Resume file: N/A
