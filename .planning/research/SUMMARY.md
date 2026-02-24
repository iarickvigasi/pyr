# Project Research Summary

**Project:** Puppy Yoga Retreat Platform — v1.1 Milestone
**Domain:** Hospitality CRM extension — multi-guest bookings, payment tracking, assistant chat history
**Researched:** 2026-02-24
**Confidence:** HIGH

## Executive Summary

The v1.1 milestone extends an already-live, well-structured codebase rather than building from scratch. All three features (multi-guest bookings, payment tracking, assistant chat history) are implementable without adding a single npm package — the existing stack of Fastify 5, Prisma 6.2.1, Next.js 15, shadcn/ui, React Query, and OpenClaw fully covers the requirements. Technology decisions are locked and proven; this milestone is entirely about schema changes, new service logic, new API endpoints, and frontend UI work.

The recommended approach is strictly sequential at the schema layer and parallel thereafter. The multi-guest booking migration is the single hardest dependency: it requires a junction table (`booking_guests`) and has a blast radius of 12+ callsites across backend services, CalDAV sync, notifications, the OpenClaw plugin, and the frontend. This migration must be fully resolved — schema updated, all callsites changed, `tsc --noEmit` clean — before any other v1.1 work begins. Payment tracking and chat history can then be built in parallel since they share no state with each other.

The key risks are not technical complexity but migration completeness. The `guestId` assumption is wired into booking lookups, CalDAV VEVENT generation, notification alerts, AI draft context, and every assistant tool that formats booking data. Partial migrations that update the schema but miss background service callsites will produce silent runtime failures in calendar sync jobs and notification sends — bugs that only surface when real booking events trigger them. The mitigation is treating the TypeScript compiler as a mandatory checklist: regenerate Prisma client after each migration, run `tsc --noEmit` across all packages, and fix every error before shipping.

## Key Findings

### Recommended Stack

No new npm packages are required for any v1.1 feature. The existing stack handles all three features via schema additions, new service implementations, and built-in Node.js APIs (`fs/promises`, `readline` for chat history). Prisma 6.2.1 remains the right choice — Prisma 7 has breaking changes (renamed generator, mandatory `output` field, required driver adapters for all databases) that are not worth migrating mid-feature. The only command needed is `pnpm prisma migrate dev` to apply schema changes.

**Core technologies:**
- **Prisma 6.2.1**: Schema migrations for `BookingGuest` junction table, `notes` on `Payment`, and optional `ChatTurn` model — no library upgrade needed
- **Fastify 5 + Zod**: New payment endpoints implemented as booking sub-resources (`/api/v1/bookings/:id/payments`) following the existing module pattern; invoice stub becomes real implementation
- **Next.js 15 + shadcn/ui**: Payment panel UI uses already-installed `Table`, `Dialog`, and `Badge` components; multi-guest booking form extends the existing combobox pattern to multi-select
- **OpenClaw plugin SDK**: New payment tools (`list_booking_payments`, `prepare_log_payment`, `prepare_delete_payment`) follow the established two-step confirmation pattern in `confirmation.ts`
- **Node.js `readline` + `fs/promises`**: Chat history reads OpenClaw's on-disk JSONL session files; no external library needed (DB-backed Option B preferred as more resilient)

See `.planning/research/STACK.md` for full version compatibility matrix and alternatives considered.

### Expected Features

The five v1.1 features must ship together as a coherent set. They are tightly interdependent in user workflow: a booking shows its guests and payment status in the same detail view, and the assistant needs both to answer natural-language booking queries.

**Must have (table stakes — v1.1 scope):**
- Multi-guest bookings: junction table, migration, create/update API accepting `guestIds[]`, booking detail showing all guests, filter/search by any guest
- Payment tracking: booking-level payment API (no invoice creation overhead), payment history list on booking detail, balance display (total / paid / balance due — always three numbers)
- Editable booking price: frontend affordance on pricing card (backend already supports via `PATCH /:id`)
- Balance color coding: green=paid, amber=partial, red=unpaid for at-a-glance status
- Chat history: stable session key across page reloads (1-line fix in `use-assistant.ts`) plus localStorage or DB message persistence

**Should have (defer to v1.x when friction is observed):**
- Payment status column on booking list view (scan 20 bookings for unpaid without opening each)
- Assistant tools for payment queries ("Who still owes me money?") and logging ("Log €500 bank transfer for Booking XYZ")
- Assistant tools for multi-guest booking creation (current `prepare_create_booking` accepts only one guest ID)
- Named chat sessions (human-readable labels instead of `dashboard:1708789234567`)

**Defer (v2+):**
- Server-side chat persistence in PostgreSQL (ephemeral conversation nature makes this low value; single user means no cross-device sync requirement)
- Payment due date reminders (Phase 2 PayPal invoicing scope)
- Per-guest payment splitting within a group booking

See `.planning/research/FEATURES.md` for full feature prioritization matrix and anti-feature analysis.

### Architecture Approach

The architecture follows a two-phase pattern: a schema-first migration that changes the data model and breaks the existing `guestId` contract codebase-wide, followed by independent feature implementation tracks. The `bookings` module has the highest blast radius; the `invoices` module is an empty stub that simply needs implementing; chat history is the most architecturally isolated change. The recommended build order is: Schema Foundation → Backend Multi-Guest → Backend Payments → Frontend (both features) → OpenClaw Plugin Updates → Chat History.

**Major components and what changes:**
1. **`booking.service.ts` + `booking.schema.ts`** — CRUD rewritten from `guestId: string` to `guestIds: string[]`; listing and filtering updated to query via `BookingGuest` junction; `syncAdditionalGuests` helper uses delete-all-then-recreate for idempotent atomic updates
2. **`invoice.service.ts` / `.schema.ts` / `.routes.ts`** — Implement all three (currently empty stubs); auto-invoice pattern: first payment to a booking auto-creates an invoice; payment endpoints registered as booking sub-routes under `/api/v1/bookings`
3. **`caldav.service.ts` + `ical-builder.ts`** — `guestName: string` → `guestNames: string[]`; VEVENT title shows primary guest or "N guests"; payment status upgraded from hardcoded heuristic to real `SUM(payments.amount)` query
4. **`notification.service.ts`** — `booking.guest.name` callsites updated to use `bookingGuests[0].guest.name`; overdue invoice alert heuristic updated from "no payment rows" to actual balance check
5. **`use-assistant.ts` (frontend)** — 1-line fix: `useState` initializer changes from always-fresh timestamp to `getStoredSessionKey()`; optional DB-backed history hydration on mount
6. **OpenClaw plugin `tools/bookings.ts`** — `Booking` interface changes from `guest?` to `guests[]`; `get_booking` response includes `paymentSummary`; three new payment tools added

See `.planning/research/ARCHITECTURE.md` for the complete file-by-file change list, data flow diagrams, and recommended build order with 35 numbered steps.

### Critical Pitfalls

1. **Breaking the `guestId` contract across the codebase** — The single-guest assumption is hard-coded in 12+ callsites: `booking.service.ts`, `listBookings()` filter, `guest.service.ts`, `dashboard.service.ts`, `caldav.service.ts`, `ical-builder.ts`, `notification.service.ts` (2 callsites), `context-builder.ts`, `booking-detail.tsx`, `booking-form-dialog.tsx`, `booking-table.tsx`, and the OpenClaw plugin `bookings.ts`. All must be updated atomically in the same phase. Prevention: `grep -r "guestId\|\.guest\." packages/` before starting; treat `tsc --noEmit` errors as a mandatory checklist.

2. **Dual payment model confusion** — The existing schema has `Invoice → Payment` tables (deployed with non-nullable `invoiceId`; service is a stub). Building a parallel `booking_payments` table avoids the existing schema but creates two payment storage paths that must be reconciled when Phase 2 PayPal invoicing arrives. Prevention: extend the existing `Payment` model (add `notes String?`, make `invoiceId` nullable, add required `bookingId`) rather than creating a new table. Auto-create an `Invoice` record on first payment if none exists.

3. **Float precision in payment amount entry** — User enters "€450.50"; naive `parseFloat(input) * 100` produces `45049.99999...` which rounds to 4504 or 4505 cents. Prevention: parse by splitting on decimal separator, use integer arithmetic throughout, validate with `Number.isInteger()` in Zod schema, use existing `formatCurrency()` for display.

4. **OpenClaw session key design determines chat history quality** — Using a timestamp-based key on every page mount means history is lost on every reload. Using a stable key (`"ines:primary"`) preserves LLM context within the same Gateway lifecycle. Additionally, OpenClaw session persistence is for LLM context, not for display — the PYR backend needs its own persistence layer (DB or localStorage) to render message history in the UI.

5. **Email-to-booking matching breaks after multi-guest migration** — `message.service.ts` and `context-builder.ts` look up bookings via `prisma.booking.findFirst({ where: { guestId: guest.id } })`. After migration this query returns nothing for any guest who is a secondary booking guest. Prevention: update all booking lookups to query via the junction: `where: { bookingGuests: { some: { guestId: guest.id } } }`.

6. **`processOverdueInvoiceAlert()` produces false positives once real payments exist** — Currently uses a heuristic: `totalPrice > 0 && status: checked_out && no payment rows`. Once real payment entries exist, fully-paid bookings will trigger the overdue alert. Prevention: update heuristic in the same phase as payment tracking backend, before any payment is logged.

7. **Two-migration strategy for the junction table** — Single migration that adds `booking_guests`, backfills data from `guest_id`, AND drops `guest_id` atomically is high-risk: if the backfill fails, the column is gone. Prevention: Migration A creates junction and backfills; Migration B (separate, verified) drops the old column.

## Implications for Roadmap

Based on research, the following phase structure is recommended. The schema migration is a mandatory gate; the three features then split into nearly-independent implementation tracks.

### Phase 1: Schema Foundation and Migration
**Rationale:** The `BookingGuest` junction table migration has a blast radius of 12+ callsites and is the hard prerequisite for all multi-guest work. All schema changes for all three features land in one migration pass to avoid repeated Prisma churn cycles. This phase also includes the data migration backfilling `booking_guests` from existing `bookings.guest_id` rows. The 1-line session key fix in `use-assistant.ts` ships here as a free win.
**Delivers:** Migrated database schema (`booking_guests` junction, `notes` on `Payment`, `invoiceId` nullable, optional `ChatTurn` table), Prisma client regenerated, `tsc --noEmit` clean across all packages.
**Addresses:** Multi-guest bookings (schema prerequisite), payment tracking (schema prerequisite), chat history (stable session key fix)
**Avoids:** Pitfalls 1, 2, 7 — schema decision locked here, two-migration strategy applied, no divergent implementations possible after this point

### Phase 2: Backend — Multi-Guest Bookings
**Rationale:** Multi-guest backend changes touch more files and modules than payment tracking, and they affect the TypeScript types that all other phases depend on. Completing this first means the type system correctly reflects the new shape before any other code is written. Payment backend is independent and follows.
**Delivers:** `createBooking` and `updateBooking` accepting `guestIds[]`; `listBookings` and `getBooking` returning `guests[]`; guest filter via junction; updated CalDAV VEVENT generation; updated notification service; updated AI context builder; email-to-booking matching updated; integration tests passing.
**Uses:** Prisma 6.2.1 explicit junction table pattern, BullMQ calendar sync queue (existing pattern)
**Implements:** `booking.service.ts`, `booking.schema.ts`, `types/entities.ts`, `guest.service.ts`, `dashboard.service.ts`, `caldav.service.ts`, `ical-builder.ts`, `context-builder.ts` (verify), `notification.service.ts`
**Avoids:** Pitfalls 1 (all 12+ callsites updated before this phase closes), 5 (email-to-booking matching updated)
**Research flag:** Standard patterns — all callsites identified in research; Prisma junction query patterns are well-documented

### Phase 3: Backend — Payment Tracking
**Rationale:** Implementing the invoice stub module is independent of multi-guest changes. The auto-invoice pattern (create invoice on first payment) is simpler to implement than the direct-booking-payments alternative and preserves Phase 2 PayPal compatibility cleanly.
**Delivers:** Fully implemented `invoice.service.ts`, `invoice.schema.ts`, `invoice.routes.ts`; payment endpoints (`GET/POST/DELETE /api/v1/bookings/:id/payments`); balance calculation (`totalPrice - SUM(payments.amount)`); real payment status in CalDAV VEVENTs; `processOverdueInvoiceAlert()` updated to use actual balance; audit logging on all payment mutations; payment amount parsing utility written and tested.
**Avoids:** Pitfall 2 (single payment model, existing tables extended), Pitfall 3 (cents parsing utility built before form work begins), Pitfall 6 (overdue alert heuristic updated before first payment is logged)
**Research flag:** Standard patterns — invoice/payment CRUD follows existing module pattern exactly; no novel integration

### Phase 4: Frontend — Multi-Guest Bookings and Payment UI
**Rationale:** Frontend is decoupled from backend by API contract. Both multi-guest UI and payment UI appear on the booking detail page, so building them in a single frontend phase reduces context-switching. All required UI components are already installed.
**Delivers:** `booking-form-dialog.tsx` with multi-select guest combobox; `booking-detail.tsx` showing all guests and hosting `PaymentPanel`; `booking-table.tsx` with "Anna Schmidt + 1 other" display; `payment-panel.tsx` (balance display + log payment dialog + history table); `use-payments.ts` React Query hooks; editable price field with overpayment confirmation dialog.
**Uses:** shadcn `Table`, `Dialog`, `Badge` (already installed), `react-hook-form` + Zod resolvers (already in use), `formatCurrency()` and `formatDate()` from `src/lib/format.ts`
**Avoids:** Pitfall 3 (payment parsing utility from Phase 3 used directly in form), Pitfall 4 (submit button disabled during mutation pending state)
**Research flag:** Standard patterns — all shadcn components and form patterns already established in codebase

### Phase 5: OpenClaw Plugin Updates
**Rationale:** Plugin changes depend on the backend API shape being finalized (Phases 2 and 3). The scope is limited: type updates in `bookings.ts` and three new payment tools following the exact same two-step confirmation pattern already used for all other write operations.
**Delivers:** Updated `tools/bookings.ts` with `guests[]` type; `get_booking` returning `paymentSummary`; `list_booking_payments`, `prepare_log_payment`, `prepare_delete_payment` tools; `'log_payment'` and `'delete_payment'` added to `PendingAction` type union; updated `TOOLS.md`.
**Avoids:** Pitfall 1 (plugin callsites `b.guest?.name` replaced with `b.guests?.[0]?.name`)
**Research flag:** Standard patterns — new tools follow the existing confirmation pattern exactly; no new plugin APIs needed

### Phase 6: Assistant Chat History
**Rationale:** Chat history is the most architecturally isolated feature and lowest migration risk. The session key fix (Phase 1) provides immediate improvement. Phase 6 delivers full DB-backed persistence with session list browsing.
**Delivers:** `chat-history.service.ts` with `ChatTurn` DB persistence; session history endpoints (`GET /api/v1/assistant/sessions`, `GET /api/v1/assistant/sessions/:key`); `use-assistant.ts` hydrates history from DB on mount; optional `chat-history-panel.tsx` for session browsing.
**Avoids:** Pitfall 4 (stable `"ines:primary"` session key), Pitfall 6 (PYR DB persistence layer is version-agnostic, separate from OpenClaw's internal session context)
**Research flag:** Needs validation — OpenClaw JSONL file-read approach (Option A in ARCHITECTURE.md) is MEDIUM confidence; DB-backed approach (Option B) is recommended as more resilient and version-agnostic. Verify OpenClaw JSONL format against installed version before choosing Option A.

### Phase Ordering Rationale

- Phase 1 is a mandatory gate: no other phase can begin with confidence until the schema migration is in place and `tsc --noEmit` passes clean across all packages
- Phases 2 and 3 are technically parallelizable but sequenced to avoid two developers touching overlapping areas (`booking.routes.ts`, `app.ts`)
- Phase 4 (frontend) can begin as soon as Phases 2 and 3 API contracts are agreed — does not require backend to be deployed, only type definitions to be stable
- Phase 5 depends on Phases 2 and 3 being complete and tested
- Phase 6 is fully independent and can be deferred without blocking any other feature

### Research Flags

Phases needing deeper research or validation during planning:
- **Phase 6 (Chat History):** OpenClaw JSONL session file format is MEDIUM confidence — verified against `v2026.2.22-2` but it is an internal, non-versioned format. Validate the exact JSONL structure before building the file-reader. The DB-backed Option B is recommended as the more robust default.

Phases with standard patterns (no additional research needed):
- **Phase 1 (Schema):** Prisma explicit junction table pattern is well-documented; matches the existing `event_bookings` junction pattern already in the codebase
- **Phase 2 (Backend Multi-Guest):** All callsites identified in research; Prisma `some:` relation filter is standard
- **Phase 3 (Backend Payments):** Implementing an existing stub module; no novel patterns
- **Phase 4 (Frontend):** All UI components already installed; pattern matches existing feature module conventions
- **Phase 5 (Plugin):** Follows the established OpenClaw two-step confirmation pattern exactly

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All findings based on direct codebase inspection of the installed and running system; no new packages required eliminates version compatibility risk entirely |
| Features | HIGH | Direct code inspection of all affected files; feature scope is tightly defined in `.planning/PROJECT.md` v1.1 milestone; anti-features and defer decisions are clearly rationalized |
| Architecture | HIGH | Every file that must change is named with the exact change required; data flow diagrams derived from reading actual source code, not assumptions; build order accounts for real dependencies |
| Pitfalls | HIGH | All 7 critical pitfalls identified from actual code reading, not pattern-matching from general training data; callsite counts are exact (not estimates); recovery strategies documented |

**Overall confidence:** HIGH

### Gaps to Address

- **OpenClaw JSONL format stability (MEDIUM):** The JSONL session file format is an internal OpenClaw implementation detail, not a documented public API. It may change across OpenClaw versions. The DB-backed chat persistence approach (Option B in ARCHITECTURE.md) is version-agnostic and is strongly preferred over reading JSONL files directly.

- **`context-builder.ts` and `notification.service.ts` exact guest access patterns (verify at Phase 2 start):** Research flagged these files as "verify" rather than confirmed callsites because they were not fully inspected. Both must be checked at the start of Phase 2 to confirm whether they access `booking.guest` directly. If they do, they join the mandatory callsite update list.

- **Existing `payments` table row count (verify before Phase 3 migration):** The `invoice.service.ts` is an empty stub and likely no payment rows exist. However, the Prisma migration making `invoiceId` nullable must verify there are zero existing rows before running. Run `SELECT COUNT(*) FROM payments` before starting Phase 3 migration.

- **`processOverdueInvoiceAlert()` timing is critical:** This alert heuristic must be updated in Phase 3 before the first payment is logged. If it ships after payment tracking, any fully-paid booking will trigger false overdue alerts until the heuristic is corrected.

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `packages/backend/prisma/schema.prisma` — current Booking, Invoice, Payment, Guest models; `invoiceId` NOT NULL on Payment confirmed
- `packages/backend/src/modules/bookings/booking.service.ts` — single `guestId` assumption, 3 filter callsites
- `packages/backend/src/services/caldav/ical-builder.ts` — `guestName: string` (singular) confirmed
- `packages/backend/src/services/caldav/caldav.service.ts` — `guest: { select: { name, email, phone } }` (singular) confirmed
- `packages/backend/src/modules/invoices/invoice.service.ts` — empty stub (`export {}`) confirmed
- `packages/backend/src/modules/notifications/notification.service.ts` — `booking.guest.name` callsites (2) confirmed
- `packages/assistant/openclaw-plugin/tools/bookings.ts` — `b.guest?.name`, `b.guest?.email`, `b.guest?.id` all singular
- `packages/assistant/openclaw-plugin/lib/confirmation.ts` — `PendingAction` type union; 1h TTL cleanup
- `packages/frontend/src/lib/hooks/use-assistant.ts` — fresh timestamp key on every mount confirmed; `getStoredSessionKey()` exists but is unused
- `packages/frontend/src/components/features/bookings/booking-detail.tsx` — single guest card confirmed
- `openclaw/agents/main/sessions/sessions.json` — empty `{}` confirmed
- `openclaw/update-check.json` — installed OpenClaw version `2026.2.22-2`
- `openclaw/openclaw.json` — session key patterns for hooks, `contextTokens: 200000`

### Secondary (HIGH confidence — official documentation)
- Prisma 7 upgrade guide (`prisma.io/docs/orm/more/upgrade-guides`) — confirmed breaking changes; stay on 6.2.1 recommended
- Prisma many-to-many relations docs (`prisma.io/docs/orm/prisma-schema/data-model/relations/many-to-many-relations`) — explicit junction table pattern recommended when extra fields or custom naming needed

### Tertiary (MEDIUM confidence — internal/community sources)
- OpenClaw `session-logs` skill documentation (`playbooks.com/skills/openclaw/openclaw/session-logs`) — JSONL format structure
- OpenClaw GitHub issue #20934 — confirmed REST session endpoints in v2026.2.22 do NOT expose transcript content; filesystem read is the only option
- IEEE 754 floating-point arithmetic — known precision issue with `parseFloat * 100` for currency conversion

---
*Research completed: 2026-02-24*
*Ready for roadmap: yes*
