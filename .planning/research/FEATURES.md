# Feature Research

**Domain:** Wellness retreat CRM — v1.1 Multi-Guest Bookings, Payment Tracking, Chat History
**Researched:** 2026-02-24
**Confidence:** HIGH (based on direct code inspection + hospitality domain patterns)

---

## Context: What Already Exists

This is a subsequent milestone on a live codebase. The following are the concrete constraints that shape every feature decision:

**Booking model (current):** Single `guestId` FK on `bookings` table. One guest per booking. `totalPrice` is set on create, no mutation endpoint for price-only edits (only via `PATCH /:id` with all fields optional).

**Payment model (current):** `Invoice` and `Payment` tables exist in schema but are entirely unimplemented — no API routes, no service logic, no frontend UI. Payments are linked through `Invoice → Payment`, requiring an invoice to exist first. The `Payment` row has: `invoiceId`, `amount`, `method` (paypal/bank_transfer/cash), `receivedAt`. No `notes` field exists yet.

**Chat/session model (current):** OpenClaw manages conversation context in-process (in-memory per Gateway instance). The `sessionKey` is `dashboard:<timestamp>` — fresh on every page load, stored in `localStorage`. No persistence layer for chat history. `sessions.json` is empty `{}`. The `/chat/reset` endpoint just generates a new timestamp key. Messages in the frontend `useAssistant` hook live in React state — they vanish on refresh.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that define the minimum useful version of each new feature area.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Multi-guest booking: add multiple guests to one booking | Retreat rooms host couples and groups. A booking for "Room 2 — Anna & Klaus" with two guest records is the normal case, not the edge case. | MEDIUM | Requires junction table `booking_guests` (bookingId, guestId). The current `bookings.guestId` FK becomes the primary/lead guest or is dropped entirely. All existing bookings must migrate gracefully. |
| Multi-guest booking: see all guests on booking detail | When Ines opens a booking she expects to see every guest's name, email, dietary needs — not just one person. Showing only one guest on a group booking is a data loss regression. | LOW | Frontend booking detail card currently shows one `booking.guest` object. Needs to become a list. Query must include all `BookingGuest` rows. |
| Multi-guest booking: filter/search bookings by any guest | Ines looks up "Does Maria have a booking in April?" — the answer must come back even if Maria is not the "primary" guest. | LOW | Query layer: `listBookings` must search by guestId across the junction table, not just the direct FK. |
| Payment tracking: log a payment with date, amount, method, notes | Ines receives bank transfers and PayPal payments and needs to record them manually. This is the core daily use. Notes field is critical for partial payments ("deposit only") and offline context. | LOW | Payments are currently tied to `Invoice`. The requirement states direct booking-level tracking without invoice creation overhead. Must decide: extend current schema or add a direct `BookingPayment` table. |
| Payment tracking: see payment history on booking detail | Balance calculation (totalPrice - sum of payments) and a dated list of what was received is the expected minimum for any accounting workflow. | LOW | Frontend needs a "Payments" card on booking detail. Backend needs a list endpoint scoped to a booking. |
| Payment tracking: balance clearly visible | Ines needs to know at a glance whether a booking is paid in full, partially paid, or unpaid. This drives follow-up decisions. | LOW | Computed field: `balance = totalPrice - sum(payments.amount)`. Color-coded (green=paid, amber=partial, red=unpaid). |
| Editable booking total price | Ines negotiates custom prices. The current `totalPrice` is set on create and only editable via the general PATCH endpoint (no dedicated UI). Needs a UI affordance. | LOW | Backend already supports `totalPrice` in `updateBooking`. Frontend needs an edit button/inline field on the pricing card. Must re-compute balance after price change. |
| Chat history: survive page refresh | A fresh `dashboard:<timestamp>` session key on every page load means all chat context is lost on refresh. Ines will lose mid-conversation context regularly. | MEDIUM | Two approaches: (1) persist messages in browser `localStorage` keyed by `sessionKey` — no backend changes; (2) persist messages in DB — requires new table + API. See Anti-Features for why option 2 is likely over-engineering. |
| Chat history: see previous conversations | Ines should be able to scroll back through earlier conversations with Koda — at minimum the current session, ideally the last N sessions. | MEDIUM | Depends on storage approach chosen. localStorage approach gives only the current session. DB approach enables session list. |

### Differentiators (Competitive Advantage)

Features that go beyond table stakes for this specific context.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Payment status on booking list | At-a-glance "Paid / Partial / Unpaid" on the booking table view. Ines can scan 20 bookings and immediately spot who still owes. | LOW | Computed at query time: sum payments per booking and compare to totalPrice. Adds one aggregation query or denormalized status field. |
| Assistant tools for payments | Ines asks Koda: "Who still owes me money?" or "Log a €500 bank transfer for Booking XYZ" and it works. Payments become part of the natural language workflow. | MEDIUM | Requires new OpenClaw plugin tools: `list_unpaid_bookings`, `prepare_log_payment`. Follows the existing two-step confirmation pattern. |
| Assistant tools for multi-guest bookings | Ines says: "Create a booking for Anna and Klaus in Room 3, April 1-7" — the assistant creates the booking and attaches both guests. | MEDIUM | The `prepare_create_booking` tool needs to accept multiple guestIds. The confirmation summary must list all guests. |
| Named chat sessions | Instead of `dashboard:1708789234567`, sessions have a label Ines can set ("Guest inquiries Feb 24", "Pricing questions"). Makes history navigable. | LOW | Store a human-readable label alongside the session key. Can be auto-generated from first message topic by AI. |
| Partial payment tracking | First payment = deposit, second = balance. The notes field handles this but a dedicated `type` field (deposit / balance / full) would make reporting cleaner. | LOW | Optional enum field on payment entry. Not critical for MVP — notes field is sufficient initially. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Invoice generation before payment logging | Existing schema requires `Invoice` before `Payment`. This matches accounting workflows. | For Ines's manual tracking workflow, creating an invoice first is friction. She receives a bank transfer and wants to log it immediately against the booking — not go through an invoice creation step. Invoice system is Phase 2 (PayPal). | Add a direct `BookingPayment` table that does NOT require an invoice. Phase 2 PayPal invoicing keeps the existing `Invoice` → `Payment` path and both coexist. |
| Lead guest / primary guest concept | Common in hotel PMS systems (one person "owns" the booking, others are guests). | For a 4-person villa with one booking, the lead guest concept adds UI complexity (who sees confirmation emails? who signs the contract?) without value for a single-admin system. Ines knows her guests. | All guests on a booking are equal. No lead/primary distinction. If one guest "matters more" for email, Ines notes it in the booking notes field. |
| Server-side chat history persistence in PostgreSQL | Seems logical — everything else is in PostgreSQL. | Chat messages are ephemeral session artifacts, not business records. Storing every "What's available in March?" exchange in the DB adds noise to business data, complicates audit logs, creates GDPR retention questions, and provides value only if Ines actually reads old chat logs (unlikely). | Store chat history in `localStorage` with a 30-day TTL. The sessionKey stored in localStorage links client-side messages to OpenClaw's in-memory session context. On page refresh, past messages appear (they were stored client-side) but the OpenClaw context is fresh (no in-memory state). For full context continuity, Ines starts a new chat. This is the correct tradeoff: zero backend complexity, good enough UX. |
| Full chat context replay on session restore | Restoring messages from localStorage + replaying them into OpenClaw's context on refresh to get full tool-call awareness. | Complex, expensive (re-sends full history to LLM), and unnecessary for a daily workflow tool. Koda's context window is 200K tokens — the real use case is the current working session, not archaeology. | Let OpenClaw context start fresh on page reload. localStorage shows message text so Ines can see what was discussed, but Koda starts without that history. If continuity matters, Ines pastes a brief recap ("We were discussing availability for April") — takes 5 seconds. |
| Per-booking payment due dates / reminders | PMS systems track "deposit due by X, balance due by Y". | This is Phase 2 (PayPal invoicing) scope. Building a due-date reminder system now means building scheduling, notification logic, and UI that will be superseded when invoice automation lands. | Notes field on payment entry covers "deposit due April 15" tracking manually. |
| Splitting totalPrice across guests | Some group booking UIs let you track who owes what portion of the total. | Adds a per-guest-per-booking amount tracking layer of significant complexity. Ines handles one group as one financial unit — she invoices whoever booked, not each member. | Single totalPrice on booking. If Ines needs to track who paid what within a group, notes field handles this adequately for MVP. |

---

## Feature Dependencies

```
Existing: bookings.guestId (single FK)
    └──replaces/extends──> BookingGuest junction table (new)
                              └──required for──> multi-guest booking creation
                              └──required for──> multi-guest booking display
                              └──required for──> filter bookings by any guest
                              └──required for──> assistant multi-guest booking tool

Existing: Invoice → Payment (schema exists, no implementation)
    └──bypassed by──> BookingPayment (new table, no invoice required)
                          └──required for──> log payment entry
                          └──required for──> payment history list
                          └──required for──> balance calculation
                          └──enhances──> booking list (payment status column)
                          └──required for──> assistant payment tools

Existing: bookings.totalPrice (editable via PATCH, no UI)
    └──requires UI for──> editable price field on booking detail
    └──interacts with──> balance calculation (must re-derive after price change)

Existing: useAssistant hook (sessionKey in localStorage, messages in React state)
    └──extends to──> localStorage message persistence (survive refresh)
    └──optional──> session list / named sessions (nice-to-have)
```

### Dependency Notes

- **BookingGuest table requires schema migration:** All existing bookings have a single `guestId`. Migration must either create `BookingGuest` rows from existing `guestId` values or keep `guestId` as a deprecated legacy field. The cleanest approach is migration + keeping `guestId` as nullable (for historical reads) while new code uses the junction table.

- **BookingPayment is independent of BookingGuest:** Both can be built in parallel by separate phases. No shared state.

- **Editable price requires no schema changes:** `totalPrice` is already PATCH-able. Only frontend work needed. But it must ship alongside payment tracking because balance = totalPrice - payments, and an editable price that doesn't update the balance display would be confusing.

- **Chat history (localStorage) requires no backend changes:** The `sessionKey` is already stored in localStorage. Extending to also store `messages` array in localStorage is pure frontend work. No API, no schema, no migration.

- **Assistant payment tools depend on BookingPayment API existing:** Tools can only be built after the backend endpoints are live.

---

## MVP Definition

### Launch With (v1.1)

All five of these must ship together — they are the explicit milestone scope:

- [ ] **Multi-guest bookings** — Junction table, migration, create/update endpoints, booking detail UI showing all guests, filter by guest
- [ ] **Payment tracking** — `BookingPayment` table, CRUD API (no invoice required), payment history UI on booking detail, balance display
- [ ] **Editable booking price** — Frontend edit affordance on pricing card (backend already works)
- [ ] **Dashboard payment UI** — Balance summary, "Add Payment" form, payment history list on booking detail
- [ ] **Assistant chat history** — localStorage persistence of messages across page refreshes (current session only)

### Add After Validation (v1.x)

- [ ] **Payment status on booking list** — Triggered when: Ines opens the bookings list and has to open individual bookings to check payment status repeatedly. Indicator: she mentions this friction.
- [ ] **Assistant tools for payments** — Triggered when: Ines starts using the assistant regularly and finds payment queries missing. Easy add-on after core payment API exists.
- [ ] **Assistant tools for multi-guest bookings** — Triggered when: Ines tries to create a group booking via Koda and it fails. The current `prepare_create_booking` tool only accepts one guestId.
- [ ] **Named chat sessions** — Triggered when: Ines wants to find a previous conversation she remembers by topic.

### Future Consideration (v2+)

- [ ] **Server-side chat persistence** — Defer until there is a demonstrated need (unlikely given the single-user, ephemeral-conversation nature of the assistant).
- [ ] **Partial payment type (deposit/balance enum)** — Defer until Ines has actually used manual payment tracking for a season and identifies this gap herself.
- [ ] **Payment due date reminders** — Defer to Phase 2 (PayPal invoicing) — natural fit with invoice automation.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Multi-guest bookings (schema + API) | HIGH | MEDIUM | P1 |
| Multi-guest booking detail UI | HIGH | LOW | P1 |
| BookingPayment table + API | HIGH | LOW | P1 |
| Payment history UI on booking detail | HIGH | LOW | P1 |
| Balance display (totalPrice - paid) | HIGH | LOW | P1 |
| Editable price UI | MEDIUM | LOW | P1 |
| Chat history (localStorage) | MEDIUM | LOW | P1 |
| Payment status on booking list | MEDIUM | LOW | P2 |
| Assistant payment tools | MEDIUM | MEDIUM | P2 |
| Assistant multi-guest tools | MEDIUM | LOW | P2 |
| Named chat sessions | LOW | LOW | P3 |
| Server-side chat persistence | LOW | HIGH | P3 |

**Priority key:**
- P1: Ships in v1.1
- P2: Ships when friction is observed
- P3: Deferred / needs stronger signal

---

## Implementation Notes by Feature

### Multi-Guest Bookings

**Schema decision:** Add `booking_guests` junction table with `(booking_id, guest_id, created_at)`. Keep `bookings.guest_id` as a nullable legacy column (do not drop — it would break existing service code and audit log references). Populate `booking_guests` from existing `guest_id` values via a migration. New bookings must require at least one guest in `booking_guests`.

**API surface needed:**
- `POST /bookings` — body accepts `guestIds: string[]` (min 1) instead of `guestId: string`
- `PATCH /bookings/:id` — accept `guestIds` to replace all guests (or addGuestId / removeGuestId for granular control)
- `GET /bookings` — `?guestId=` filter queries junction table
- `GET /bookings/:id` — includes all guests from junction table

**CalDAV impact:** Calendar event descriptions currently embed the single guest name. With multi-guest, must join all guest names (e.g., "Anna Müller, Klaus Müller"). Existing CalDAV sync service needs to be updated for the enriched query.

**Availability engine:** No change needed. Availability is room-based (`roomId` + date range), not guest-based.

### Payment Tracking

**Schema decision:** Add `booking_payments` table (not `invoice_payments`) with:
- `id`, `booking_id`, `amount` (cents), `method` (paypal/bank_transfer/cash), `paid_at` (date), `notes` (text, nullable), `created_at`

Do NOT touch the existing `Invoice` / `Payment` tables — those are Phase 2 scope and remain intact for future PayPal integration.

**Balance derivation:** Always computed, never stored. `balance = booking.totalPrice - SUM(booking_payments.amount WHERE booking_id = X)`. Return as computed field on `GET /bookings/:id` and the payment list response.

**API surface needed:**
- `GET /bookings/:id/payments` — list all payment entries with balance summary
- `POST /bookings/:id/payments` — log new payment entry
- `DELETE /bookings/:id/payments/:paymentId` — remove erroneous entry (no edit — delete and re-add)

**Why no PATCH on individual payment:** Editing a payment is rare and error-prone. The correct workflow is: delete the wrong entry, create the correct one. This produces a clean audit trail.

### Editable Booking Price

**Backend:** No changes needed. `PATCH /bookings/:id` with `{ totalPrice: number }` already works.

**Frontend:** Add an edit icon on the "Room & Pricing" card in `booking-detail.tsx`. Clicking opens an inline number input (or a small dialog) pre-filled with `totalPrice`. On save, calls `PATCH`. The balance display must re-query (or optimistically update) after the price changes.

### Chat History (localStorage)

**Approach:** In `useAssistant` hook, persist `messages` array to `localStorage` under key `pyr_chat_messages:<sessionKey>`. Load on mount. Clear when `resetSession()` is called (which already generates a new sessionKey). Apply a max message count (e.g., 100) to prevent unbounded localStorage growth.

**SessionKey continuity:** Currently `sessionKey` is set to `dashboard:<timestamp>` on every page load (line 88 of `use-assistant.ts`). Change this: if a stored sessionKey exists in localStorage, use it on mount (instead of generating fresh). Only generate a new one on explicit "New Conversation" reset. This preserves both the message display AND the OpenClaw context within the same browser session.

**OpenClaw context on refresh:** Even with sessionKey continuity, OpenClaw's in-memory session state may be lost if the Gateway restarts. The localStorage messages will show correctly in the UI (Ines sees the conversation history), but Koda won't have tool-call context from previous turns. This is acceptable — the visual history is the primary value, not replay of tool state.

**Session list UI (P3):** Not needed for v1.1. The single-session persistence is sufficient.

---

## Sources

- Direct code inspection: `packages/backend/prisma/schema.prisma` — current Booking, Invoice, Payment models
- Direct code inspection: `packages/backend/src/modules/bookings/booking.service.ts` — current single-guest create flow
- Direct code inspection: `packages/frontend/src/lib/hooks/use-assistant.ts` — current sessionKey/messages state management
- Direct code inspection: `packages/backend/src/modules/assistant/assistant.routes.ts` — SSE proxy, session key generation
- Direct code inspection: `openclaw/workspace/TOOLS.md` — current 38 tools, confirmation flow pattern
- Direct code inspection: `openclaw/agents/main/sessions/sessions.json` — confirmed empty (no persistence)
- `.planning/PROJECT.md` — v1.1 milestone scope, out-of-scope boundaries

---

*Feature research for: v1.1 Multi-Guest Bookings, Payments & Chat History*
*Researched: 2026-02-24*
