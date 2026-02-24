# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Ines can manage her entire business from one system -- see every guest, booking, and message in one place, get AI-drafted replies she approves with one tap, and control everything via the AI assistant.
**Current focus:** Phase 14 -- Backend Payment Tracking

## Current Position

Phase: 14 (3 of 5 in v1.1) -- Backend Payment Tracking
Plan: 0 of ?
Status: Not started
Last activity: 2026-02-24 -- Completed 13-02 (Downstream callsite updates)

Progress: [####......] 40% (4/10 plans across 5 phases)

## Performance Metrics

**Velocity (v1.0):**
- Total plans completed: 31
- Average duration: 6min
- Total execution time: 2.98 hours

**Velocity (v1.1):**
- Total plans completed: 4
- Average duration: 5min
- Total execution time: 0.33 hours

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

### Pending Todos

None yet.

### Research Flags

- Phase 12: Two-migration strategy for junction table (create+backfill, then drop old column)
- Phase 14: Verify zero existing payment rows before making invoiceId nullable
- Phase 14: processOverdueInvoiceAlert must be updated before first payment is logged

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-24
Stopped at: Completed 13-02-PLAN.md
Resume file: N/A
