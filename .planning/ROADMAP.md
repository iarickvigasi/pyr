# Roadmap: Puppy Yoga Retreat -- v1.1 Multi-Guest Bookings, Payments & Chat History

## Overview

v1.0 shipped the full MVP: CRM, email ingestion with AI-drafted replies, CalDAV calendar sync, OpenClaw AI assistant, and admin dashboard (Phases 1-11, archived). v1.1 extends bookings to support multiple guests, adds manual payment tracking with full history, and persists assistant chat conversations. The work flows schema-first (migration has 12+ callsite blast radius), then backend features in parallel tracks, then frontend assembly, then assistant integration.

## Milestones

- v1.0 MVP -- Phases 1-11 (shipped 2026-02-24). See MILESTONES.md.
- v1.1 Multi-Guest Bookings, Payments & Chat History -- Phases 12-16 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

v1.0 phases (1-11) are archived in MILESTONES.md. v1.1 continues from Phase 12.

- [x] **Phase 12: Schema Migration & Chat History** - Database migration (junction table, payment schema), Prisma regeneration, stable assistant session key, localStorage chat persistence
- [ ] **Phase 13: Backend Multi-Guest Bookings** - Booking CRUD rewrite for guestIds[], CalDAV/notification/context-builder callsite updates, guest filter via junction
- [ ] **Phase 14: Backend Payment Tracking** - Invoice stub implementation, payment CRUD endpoints, balance calculation, overdue alert fix, payment status on listing
- [ ] **Phase 15: Frontend Multi-Guest & Payments** - Multi-guest booking form, guest display on detail page, payment panel (balance, logging, history), color-coded status, editable price
- [ ] **Phase 16: Assistant Integration** - OpenClaw plugin updates for multi-guest bookings and payment tools

## Phase Details

### Phase 12: Schema Migration & Chat History
**Goal**: The database schema supports multi-guest bookings and payment tracking, the Prisma client reflects the new shape, all packages compile clean, and assistant chat persists across page refreshes
**Depends on**: Nothing (first v1.1 phase; builds on completed v1.0)
**Requirements**: CHAT-01, CHAT-02
**Success Criteria** (what must be TRUE):
  1. Assistant chat session persists when Ines refreshes the dashboard page -- the same conversation continues without reset
  2. Chat messages from the current session are visible after a page refresh (stored in localStorage and hydrated on mount)
  3. `tsc --noEmit` passes clean across all packages (backend, frontend, assistant, shared) after Prisma client regeneration
  4. A `booking_guests` junction table exists in the database with existing bookings backfilled from the old `guestId` column
**Plans**: 2 plans

Plans:
- [x] 12-01-PLAN.md -- Schema migration: BookingGuest junction table, Payment model updates, backfill, Prisma regeneration, cross-package compilation
- [x] 12-02-PLAN.md -- Chat persistence: stable session keys, localStorage message storage, hydration on mount, tool summaries, context-loss banner

### Phase 13: Backend Multi-Guest Bookings
**Goal**: The booking API accepts and returns multiple guests per booking, and all downstream systems (CalDAV, notifications, AI context, email matching) correctly handle the new data shape
**Depends on**: Phase 12
**Requirements**: MBOOK-01, MBOOK-03, MBOOK-04
**Success Criteria** (what must be TRUE):
  1. `POST /api/v1/bookings` and `PATCH /api/v1/bookings/:id` accept a `guestIds` array and associate all specified guests with the booking
  2. `GET /api/v1/bookings` supports filtering by any guest on a booking (not just a single guestId) -- searching for "Anna" returns bookings where Anna is any guest, not just the first
  3. Apple Calendar events for bookings display all guest names (e.g., "Anna Schmidt, Max Muller -- Suite Room") instead of a single guest name
  4. Email-to-booking matching finds bookings for guests who are secondary booking guests (not just the original single guestId)
**Plans**: TBD

### Phase 14: Backend Payment Tracking
**Goal**: Ines can track payments against bookings through the API -- log, list, and delete payment entries with accurate balance calculation
**Depends on**: Phase 12
**Requirements**: PAY-01, PAY-05, PAY-06, PAY-07
**Success Criteria** (what must be TRUE):
  1. `POST /api/v1/bookings/:id/payments` creates a payment entry with date, amount (integer cents), method, and optional notes -- audit-logged
  2. `DELETE /api/v1/bookings/:id/payments/:paymentId` removes an erroneous payment entry -- audit-logged
  3. `GET /api/v1/bookings/:id` includes a payment summary: totalPrice, totalPaid, balanceDue (all in integer cents)
  4. `GET /api/v1/bookings` includes a paymentStatus field per booking (paid/partial/unpaid) for list-level display
  5. The overdue invoice alert (`processOverdueInvoiceAlert`) uses actual payment balance instead of the old heuristic, preventing false positives for paid bookings
**Plans**: TBD

### Phase 15: Frontend Multi-Guest & Payments
**Goal**: Ines can assign multiple guests to bookings, see all guests on a booking, view and manage payments, and see at-a-glance payment status -- all from the dashboard
**Depends on**: Phase 13, Phase 14
**Requirements**: MBOOK-02, PAY-02, PAY-03, PAY-04
**Success Criteria** (what must be TRUE):
  1. The booking form dialog supports selecting multiple guests (multi-select combobox) when creating or editing a booking
  2. The booking detail page displays all guests assigned to the booking with links to their guest profiles
  3. The booking detail page shows a payment panel: balance display (total / paid / due), a form to log payments, and a history table of all payment entries
  4. Balance indicators are color-coded: green when fully paid, amber when partially paid, red when unpaid
  5. The booking list table shows a payment status column (Paid / Partial / Unpaid) with color-coded badges
**Plans**: TBD

### Phase 16: Assistant Integration
**Goal**: Ines can create multi-guest bookings and manage payments through natural language via the AI assistant
**Depends on**: Phase 13, Phase 14
**Requirements**: MBOOK-05, PAY-08
**Success Criteria** (what must be TRUE):
  1. Ines can tell the assistant "Book Anna and Max into the Suite for March 09-19" and it creates a booking with both guests (after confirmation)
  2. Ines can ask "What's the payment status for booking #123?" and get the balance summary (total, paid, due)
  3. Ines can tell the assistant "Log a 500 euro bank transfer for booking #123" and it creates the payment entry (after confirmation)
  4. The assistant's booking query responses include all guest names and payment status (not just the old single-guest format)
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 12 -> 13 -> 14 -> 15 -> 16
(Phases 13 and 14 are technically parallelizable but sequenced for solo dev)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 12. Schema Migration & Chat History | v1.1 | 2/2 | Complete | 2026-02-24 |
| 13. Backend Multi-Guest Bookings | v1.1 | 0/? | Not started | - |
| 14. Backend Payment Tracking | v1.1 | 0/? | Not started | - |
| 15. Frontend Multi-Guest & Payments | v1.1 | 0/? | Not started | - |
| 16. Assistant Integration | v1.1 | 0/? | Not started | - |
