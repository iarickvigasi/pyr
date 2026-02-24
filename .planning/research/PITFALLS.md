# Pitfalls Research

**Domain:** Adding multi-guest bookings, payment tracking, and assistant chat history to an existing hospitality platform
**Project:** Puppy Yoga Retreat — v1.1 milestone
**Researched:** 2026-02-24
**Confidence:** HIGH — derived from direct code inspection of the v1.0 codebase, not training data assumptions

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or broken integrations.

---

### Pitfall 1: Breaking the Single-`guestId` Contract Across the Entire Codebase

**What goes wrong:**
The migration to multi-guest bookings removes or nulls the `guestId` foreign key on `Booking` and replaces it with a join table. But `guestId` is not just a database field — it is a hard-wired assumption throughout the codebase:

- `booking.service.ts` accepts `guestId` in `CreateBookingBody` and passes it directly to `prisma.booking.create({ data: { guestId } })`.
- `listBookings()` accepts a `guestId` query filter: `if (query.guestId) where.guestId = query.guestId`.
- `booking.routes.ts` returns a `BookingWithRelations` that embeds a single `guest` object with `{ id, name, email, phone, language }`.
- The OpenClaw plugin's `bookings.ts` consumes `b.guest?.name`, `b.guest?.email`, `b.guest?.id` — all singular.
- `sendNewBookingAlert()` in `notification.service.ts` queries `booking.guest.name` to format the WhatsApp alert.
- `processGuestArrivalAlert()` queries `booking.guest.name` for every arriving booking.
- `ical-builder.ts` builds VEVENTs with `params.guestName` (singular) and embeds it in the title: `"Guest Name — Room Name"`.
- `caldav.service.ts` calls `syncBookingToCalendar()` which loads `guest: { select: { name, email, phone } }`.
- The frontend `booking-detail.tsx` renders a single guest card with `booking.guest.id`, `booking.guest.name`, `booking.guest.email`.
- The frontend `booking-form-dialog.tsx` has a `guestId` field as the primary booking input.

If the migration removes `guestId` from `Booking` without updating every one of these callsites, the system will crash at runtime in at least 12 places. TypeScript will catch most of them at compile time, but only if the Prisma client is regenerated and the build is checked before deploying.

**Why it happens:**
Developers migrate the schema and the create-booking endpoint, verify it "works", and ship. The calendar sync, notification, and assistant code paths are only exercised in the background — they don't fail until a real booking event triggers them (a new booking alert, a morning briefing, a calendar sync).

**How to avoid:**
1. Before writing any migration code, run `grep -r "guestId\|\.guest\." packages/` to inventory every callsite that touches the single-guest assumption. There are at minimum 12 callsites — track them all in the phase plan.
2. Decide on the canonical "primary guest" concept: one guest on the join table gets a `isPrimary: true` flag. All existing singular-guest callsites are updated to use the primary guest as the backward-compatible default.
3. Regenerate the Prisma client after the schema migration, run `tsc --noEmit` across all packages, and treat all TypeScript errors as a checklist — do not suppress them.
4. The CalDAV VEVENT title format `"Guest Name — Room Name"` must be updated to show primary guest or "Guests (N)" for multi-guest bookings. Do this in `ical-builder.ts` in the same phase as the schema migration.
5. The notification service alert formatters must be updated in the same phase — not a follow-on.

**Warning signs:**
- `tsc --noEmit` passes but `booking.guest` is typed as `Guest | null` after schema change — any non-null assertion `booking.guest.name` becomes a runtime crash.
- Calendar sync jobs start failing silently (syncStatus = 'failed') after migration.
- WhatsApp alerts stop being sent after the first booking created post-migration.

**Phase to address:**
Phase 1 (schema migration and service layer update). This must be fully resolved in a single phase — no partial migrations that leave some callsites on the old model.

---

### Pitfall 2: Existing Payment Data in Schema vs. New Payment Tracking Causing Dual-Model Confusion

**What goes wrong:**
The v1.0 schema already has `invoices` and `payments` tables — they are real, deployed tables. The `payments` table already has: `id`, `invoiceId`, `amount`, `method`, `receivedAt`. The `invoices` table has `bookingId`, `guestId`, `amount`, `status`, and `paypalInvoiceId`.

The v1.1 requirement is "payment tracking with full history (date, amount, method, notes per entry)". A developer could interpret this as:
- (a) Adding a `notes` field and a direct `bookingId` foreign key to the existing `Payment` model, or
- (b) Creating an entirely new `payment_entries` table alongside the existing one, or
- (c) Adding fields directly to `Booking.totalPrice` and treating each update as a payment record.

Any of these interpretations produces a different data model. If the implementation is done without a clear decision, the codebase ends up with two separate payment data flows: one used by the invoice/PayPal path (Phase 2) and one used by the new manual payment tracking UI. When Phase 2 is implemented later, the team has to reconcile two models.

The existing `invoice.service.ts` file is a placeholder (`export {}`), but `invoice.routes.ts` is deployed and `Invoice`/`Payment` models are in the live schema with foreign keys. Any migration must account for existing (potentially empty) rows.

**Why it happens:**
The feature request says "payment tracking" but doesn't specify how it relates to the existing invoice/payment tables. The path of least resistance is to add new fields, but this conflicts with the Phase 2 PayPal integration that was specifically designed to use the `Invoice -> Payment` structure.

**How to avoid:**
1. The correct approach for v1.1 is to add a `notes` field to the existing `Payment` model and make `invoiceId` optional (allowing a direct `bookingId` link for manual payments that don't have a formal invoice). This keeps the schema aligned with Phase 2.
2. Do not create a parallel payment table. The `Invoice -> Payment` design from the original schema is sound for both manual tracking and PayPal.
3. The Prisma migration must be additive only: add `notes String?` and `bookingId String?` to `Payment`, make `invoiceId String?` nullable. No columns dropped. No existing data affected.
4. Document explicitly in the migration: "Phase 2 (PayPal) will use `invoiceId`; v1.1 manual payments use `bookingId` directly."
5. The overdue invoice alert in `notification.service.ts` uses `processOverdueInvoiceAlert()`, which currently checks for bookings with no payment records using a simplified heuristic: `totalPrice > 0` and `status: checked_out` with no payments. Once real payment entries exist, this logic must be updated or it will produce false alerts for fully-paid bookings.

**Warning signs:**
- A migration creates a new table called `payment_entries` or `booking_payments` — this is the signal that the model is splitting.
- The Phase 2 PayPal research notes say "the payment schema needs to be redesigned" — this means v1.1 built it incompatibly.
- The overdue invoice alert fires for bookings that have been fully paid.

**Phase to address:**
Phase 1 (schema decision and migration). The schema design must be settled before any service or UI code is written.

---

### Pitfall 3: Floating-Point Cents Arithmetic in Payment UI and Editable Price

**What goes wrong:**
The booking detail UI and payment entry form accept user input for amounts in EUR (e.g., "€450.50"). The backend stores amounts as integer cents. The conversion between the two is error-prone:

- User enters "450.50" → frontend sends `45050` (correct)
- User enters "450.5" → frontend sends `4505` (wrong — 10x off if using `parseFloat * 100`)
- User enters "€450,50" (European comma decimal) → `parseFloat("450,50")` returns `450` (wrong)
- Accumulated payments: `[10000 + 20000 + 30000]` = `60000` cents — correct as integer arithmetic
- But: `[100.00 + 200.00 + 300.00]` = `600.00` — then `* 100` = `60000.0000000001` due to IEEE 754

The existing code has one correct example: `booking-form-dialog.tsx` uses `z.coerce.number().int()` for `totalPrice`. But this validation only catches non-integer inputs — it does not catch the user-facing EUR string conversion that happens before Zod sees the value.

**Why it happens:**
The payment amount input shows "€450.50" to the user. The developer writes `Math.round(parseFloat(inputValue) * 100)` which works for clean numbers but has precision issues. Or they use `Number(input) * 100` which has the same problem. The bug is invisible during development when only round numbers are tested.

**How to avoid:**
1. Use integer math only. Accept user input as a string. Parse it by splitting on the decimal separator: `const [euros, cents] = input.split('.')`; result is `parseInt(euros) * 100 + parseInt(cents?.padEnd(2, '0').slice(0, 2) ?? '0')`.
2. Never use `parseFloat * 100`. Always use `Math.round` as the final step if float arithmetic is unavoidable.
3. The Zod schema for payment amount in the frontend must validate that the result is a valid integer: `.refine(v => Number.isInteger(v))`.
4. Display currency using the existing `formatCurrency()` from `packages/frontend/src/lib/format.ts` — it correctly handles the cents-to-display conversion.
5. The "editable booking price" feature means `PATCH /api/v1/bookings/:id` will accept `totalPrice`. This already works in the existing `updateBooking()` service — no new logic needed, just the UI to expose it.

**Warning signs:**
- A payment of €450.50 is stored as 4504 or 4506 cents.
- The "balance due" calculation shows €0.01 remaining after a full payment.
- A payment test with an odd cent value (e.g., €123.45) fails intermittently.

**Phase to address:**
Phase 2 (payment UI and entry form). The amount parsing utility should be written and tested before building any form that accepts payment input.

---

### Pitfall 4: Race Condition on Concurrent Payment Edits Producing Incorrect Balance

**What goes wrong:**
The payment history UI allows logging individual payment entries. If Ines opens the booking detail page and clicks "Add payment" twice in rapid succession (or if a background sync job and a UI action happen concurrently), two payment entries can be created simultaneously. The balance calculation (totalPrice minus sum of payments) reads the existing sum, both write a new payment, and the final balance is wrong.

In this specific system, with a single admin user and no automated payment creation, this is LOW probability. But the payment sum query is not atomic — it reads and then the UI sends a write. A slow network can create a window where two writes race.

**Why it happens:**
The naive implementation queries `SELECT SUM(amount) FROM payments WHERE booking_id = ?` and then renders the balance. The write (`INSERT INTO payments`) is a separate operation with no lock on the booking.

**How to avoid:**
1. Do not enforce uniqueness constraints on payment entries — legitimate duplicate amounts (e.g., two installments of the same size) must be allowed.
2. The balance display is always computed dynamically from `SUM(payments.amount)`, never cached or stored separately. This is idempotent — multiple reads always produce the correct answer.
3. The prevent rapid double-submission: the "Add Payment" button must be disabled after the first click until the response returns. Use React Query's `mutationState.isPending` to disable the button.
4. For a single-user system, optimistic locking is overkill. The practical prevention is UI-level: disable the submit button on submit. Do not add unnecessary database-level locks.

**Warning signs:**
- The balance shows a negative number (overpayment) that doesn't match the payment history.
- Two payment entries with identical `receivedAt` timestamps exist in the history.

**Phase to address:**
Phase 2 (payment entry form). The button-disable pattern must be in the initial implementation.

---

### Pitfall 5: OpenClaw Session Key Design Determining Chat History Quality

**What goes wrong:**
OpenClaw's session persistence is controlled entirely by `sessionKey`. The current hook mappings in `openclaw.json` use these session keys:
- `hook:briefing` — briefings share one session (good: context about previous briefings is maintained)
- `hook:alert` — all alerts share one session (potentially bad: alert context bleeds across unrelated alerts)
- `hook:draft:<timestamp>` — each draft gets a unique session (draft context is isolated, which is correct)

For interactive Ines-to-assistant chat, there is currently no canonical session key defined. The `sessions.json` file is empty (`{}`). The frontend `assistant/page.tsx` renders a `ChatContainer` component — how it generates or passes a session key to OpenClaw Gateway determines whether chat history is preserved across page reloads and browser sessions.

If the chat history feature is implemented by:
- (a) Using a new session key per browser tab — history is lost on every page reload
- (b) Using a hardcoded key like `"ines-main"` — history persists correctly
- (c) Using a timestamp-based key like `hook:chat:${Date.now()}` — same as (a)

The sessions.json being empty means no sessions have been established yet — this is the right time to design the key before any history accumulates.

**Why it happens:**
The OpenClaw session key design is not documented as a feature decision — it looks like an implementation detail. Developers choose a session key based on what's easy (unique per request, or per page load), not based on what maintains conversational continuity.

**How to avoid:**
1. Use a stable, well-known session key for Ines's primary chat session: `"ines:primary"`. This key must be the same regardless of which channel Ines uses (WhatsApp, the dashboard chat widget, or future channels).
2. The frontend `ChatContainer` component must use `OpenClaw Gateway`'s chat completions endpoint with `sessionKey: "ines:primary"` on every request — not a new key per session or per component mount.
3. Separate the alert and briefing session keys from the interactive chat session. Alerts using `hook:alert` accumulating in `ines:primary` would pollute the conversational context with operational noise.
4. If OpenClaw Gateway does not expose a way to read the session history via API (as opposed to continuing a session), a separate `AssistantChatMessage` table in the PYR database may be needed to render the chat history in the dashboard UI. The session in OpenClaw maintains LLM context; the PYR database maintains display history.

**Warning signs:**
- Ines asks "What did I ask you earlier today?" and the assistant says it has no memory of the conversation.
- The chat UI shows no previous messages on page reload even though the OpenClaw session has history.
- Alert messages appear in the middle of Ines's interactive chat thread.

**Phase to address:**
Phase 3 (assistant chat history). The session key must be decided before any history-writing code is written.

---

### Pitfall 6: OpenClaw Has No Native Chat History Display API

**What goes wrong:**
OpenClaw Gateway persists session history for LLM context purposes (so the assistant "remembers" what was discussed). However, the `sessions.json` file shows sessions are stored as files on disk, not queryable via the PYR backend API. The dashboard chat UI (rendered by `ChatContainer`) needs to display previous messages — but there is no `/api/v1/assistant/history` endpoint that reads from OpenClaw's session store.

This is not a theoretical concern: the `assistant/page.tsx` page exists in the v1.0 frontend and presumably has some chat display. If it currently only shows messages from the current browser session (in-memory React state), then "persistent chat history" requires a separate storage mechanism.

**Why it happens:**
Developers assume that because OpenClaw persists sessions, the history is readable. In practice, OpenClaw's session persistence is for LLM context continuity — the stored data is the raw message array in a format optimized for re-injection into the model, not for display in a React UI.

**How to avoid:**
1. Implement a thin persistence layer in the PYR database: a `AssistantMessage` table with `(id, role: 'user'|'assistant', content, createdAt)`. Every message exchanged through the chat UI is written to this table by the PYR backend.
2. The dashboard chat UI fetches history from `GET /api/v1/assistant/messages` (PYR backend), not from OpenClaw Gateway.
3. OpenClaw Gateway continues to own the LLM context (session history). The PYR database owns the display history. These are separate concerns.
4. The session key used for OpenClaw (`"ines:primary"`) and the PYR assistant message store are linked by convention, not by a foreign key.
5. Consider message limits: keep the last 200 messages in the display history. Older messages are archived.

**Warning signs:**
- The team discovers that there is no API to query OpenClaw session history during implementation.
- The chat UI shows an empty history on every page load.
- A workaround is implemented that stores chat messages in browser localStorage — this is lossy and browser-specific.

**Phase to address:**
Phase 3 (assistant chat history). The storage design must be decided before any UI is built.

---

### Pitfall 7: Multi-Guest Booking Breaks Email-to-Booking Matching Logic

**What goes wrong:**
The existing email ingestion pipeline matches inbound emails to guests by the sender's email address, then links the conversation to a guest via `conversation.guestId`. The conversation is then linked to a booking by looking up the guest's active bookings via `booking.guestId`.

After multi-guest migration, a booking has multiple guests. An email from guest B (who is part of a booking with guest A as the "primary") will match to guest B's conversation, but the booking lookup `WHERE guestId = B.id` will return zero results because the booking is linked via the join table, not via `guestId` directly.

This breaks:
1. The OTA email parser's ability to link emails to bookings.
2. The AI draft context injection, which uses the guest's booking to build the "current booking" context for the prompt.
3. The source conversation linkage on bookings (the `sourceConversationId` field on `Booking`).

**Why it happens:**
The email-to-booking matching logic in `message.service.ts` and the AI context builder in `agent.service.ts` both use `prisma.booking.findFirst({ where: { guestId: guest.id } })`. After migrating to many-to-many, this query returns nothing.

**How to avoid:**
1. After the schema migration, update the booking lookup to query via the join table: `prisma.booking.findFirst({ where: { guests: { some: { guestId: guest.id } } } })`.
2. Audit every service that currently does `booking.findFirst({ where: { guestId } })` — there are at minimum 3 callsites.
3. The AI draft context builder needs to handle the case where the found guest is not the "primary" guest on the booking — the context should include all guests' names and details.

**Warning signs:**
- After migration, new emails from guests with existing multi-guest bookings no longer generate AI drafts.
- The booking detail page for a conversation shows "No linked booking" even when the guest is on a booking.

**Phase to address:**
Phase 1 (schema migration). Every service-layer booking lookup must be updated in the same phase as the schema change.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keeping `guestId` on `Booking` as a "primary guest" column alongside the join table | Avoids touching all 12+ callsites | Schema inconsistency — two ways to represent the same relationship; Phase 2 PayPal invoicing uses `guestId` on Invoice, making it unclear which guest | Only if the join table is additive (join table adds secondary guests, primary stays in `guestId`) |
| Storing payment totals as a denormalized column on `Booking` | Faster balance display | Gets out of sync with payment entries; payments deleted or edited leave `Booking.paidAmount` stale | Never — always compute from SUM of entries |
| Using OpenClaw's `sessions.json` as the chat history source | No new database table | Not queryable, breaks if OpenClaw is restarted with a fresh sessions file, format is LLM-specific not display-specific | Never — build a display layer in PYR DB |
| Adding `notes` to the existing `Payment` table and calling it done | Reuses existing table | `invoiceId` is currently NOT NULL — making it nullable is a breaking schema change that could affect existing rows | Acceptable if migration is careful and existing rows are backfilled |
| Skipping migration for existing `payments` rows (there are likely none since invoice service is a placeholder) | Saves migration complexity | If any rows exist (e.g., seed data), migration fails | Verify row count before assuming table is empty |

---

## Integration Gotchas

Common mistakes when connecting to external services or internal systems.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **OpenClaw Gateway (chat history)** | Assuming `sessionKey` is queryable as a message list | Sessions are opaque to the PYR backend. Write display messages to PYR DB separately. |
| **OpenClaw Gateway (session key)** | Using per-request or per-mount unique keys for Ines's chat | Use stable `"ines:primary"` key so LLM context is continuous across reloads and channels |
| **CalDAV VEVENT (multi-guest)** | VEVENT title still shows single guest name after migration | Update `ical-builder.ts` to use primary guest name or "N guests" format in the same phase as schema migration |
| **OpenClaw plugin tools (bookings)** | `get_booking` returns `b.guest?.name` — crashes silently after removing single `guest` relation | Update plugin to read from `guests[]` array and surface primary guest or all guest names |
| **Notification service (alerts)** | `sendNewBookingAlert()` calls `booking.guest.name` — nulls after migration | Update to use primary guest from join table in same phase |
| **Payment overdue alert** | `processOverdueInvoiceAlert()` checks for bookings with no payment rows — fires on all paid bookings once real payment entries exist | Update heuristic to check `SUM(payments.amount) < booking.totalPrice` after payment tracking is live |
| **Prisma type safety** | Regenerating Prisma client after schema change and ignoring new TypeScript errors | Always run `tsc --noEmit` across all packages after each Prisma migration and treat errors as mandatory fixes |

---

## Performance Traps

Patterns that work now but create problems as data grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading full payment history on every booking detail load with no limit | Booking detail slow for guests with many installments | Add `take: 100` to payment query; paginate if needed | At ~500 payments (unlikely for this use case) |
| Aggregating payment sum in application layer (loading all payments, summing in JS) | Slow balance calculation | Use `prisma.payment.aggregate({ _sum: { amount: true } })` — let the DB do the math | At ~50 payments per booking |
| No index on `payments.bookingId` (if added directly) or `booking_guests.bookingId` | Slow balance and guest lookup queries | Add `@@index([bookingId])` in Prisma schema for any new foreign key | At ~1000 bookings |
| OpenClaw session growing unboundedly | LLM context window overflow — older messages are truncated silently | Design session with max context tokens (already configured: `contextTokens: 200000` in `openclaw.json`) and periodic session pruning | When Ines has ~500+ messages in a session without pruning |

---

## Security Mistakes

Domain-specific security issues for payment tracking and multi-guest data.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing all guests on a booking in the API response without filtering | If guest B on a booking is retrieved by Guest A's context, personal data leaks between guests | Scope API responses — the booking detail shows all guests, but guest detail only shows their own bookings |
| Storing payment notes with PII (e.g., "paid by IBAN DE89...") in plaintext | GDPR — IBAN is personal financial data | Payment notes field must exclude full account numbers; if stored, must be treated as PII in data export/deletion flows |
| OpenClaw session history containing full tool responses (which include guest data) persisting indefinitely | GDPR — session data is personal data if it contains guest names, emails, bookings | Define retention policy: sessions older than 90 days are cleared. OpenClaw's session files on disk must be included in backup encryption. |
| The assistant confirmation flow's `pendingActions` Map is in-memory | Not a security risk per se, but pending actions contain full booking/guest payloads; if OpenClaw process is compromised, this data is exposed | Acceptable for single-user system; note that pending actions already expire after 1 hour via `cleanupStaleActions()` |

---

## UX Pitfalls

Common user experience mistakes for these specific features.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Balance display shows total price vs. amount paid as separate numbers without a clear "still owed" figure | Ines has to do mental arithmetic | Always show three numbers: Total Price, Amount Paid, Balance Due — never fewer |
| Adding a second guest to a booking requires knowing their guest ID | Ines has to navigate to the guest list, copy the ID, return to the booking | Guest search combobox (same as booking creation form already uses) |
| Payment history shows timestamps in UTC | Ines sees "2026-03-14T22:00:00Z" instead of "March 15, 2026" | Format all payment timestamps using `formatDate()` from `packages/frontend/src/lib/format.ts` with Europe/Nicosia timezone |
| Chat history shows assistant messages but not tool call results | Ines can't see what data the assistant fetched | Display tool results as collapsible "assistant looked up" blocks, not raw JSON |
| Editable price field has no warning when price is changed after a payment exists | Ines edits price down to €400 when €500 is already recorded as paid — balance goes negative | Show confirmation dialog: "This booking has €500.00 recorded as paid. Changing the total to €400.00 will show an overpayment. Confirm?" |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Multi-guest schema migration:** Migrated schema and created join table — verify all 12+ `guestId` callsites across backend, frontend, assistant plugin, and notifications are updated. Run `tsc --noEmit` across all packages.
- [ ] **CalDAV sync after multi-guest:** Syncs appear to complete — verify that booking VEVENT titles and descriptions display the correct guest name(s) in Apple Calendar. Check `ical-builder.ts` was updated.
- [ ] **Payment tracking:** Payment entry form saves data — verify `processOverdueInvoiceAlert()` in `notification.service.ts` now reads from actual payment records, not the old "no payments = unpaid" heuristic.
- [ ] **Chat history display:** Messages appear in chat UI — verify they persist across page reloads by refreshing the page and checking the history re-renders from the database, not from React state.
- [ ] **Assistant booking tools after multi-guest:** `list_bookings` and `get_booking` tools return data — verify that `b.guest?.name` is not undefined for any returned booking after the schema change.
- [ ] **Payment cents precision:** Payment amount input accepts "123.45" — verify the stored value is `12345` cents, not `12344` or `12346`. Test with an odd-cents amount like €99.99.
- [ ] **Editable price with existing payments:** `PATCH /api/v1/bookings/:id` with `totalPrice` updates correctly — verify the balance calculation updates in real-time in the UI after the price change.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Deployed migration breaks `booking.guest` relation at runtime | HIGH | Roll back the Prisma migration (`prisma migrate rollback`), revert the schema, re-run `tsc --noEmit` with errors visible. Do not patch live schema manually. |
| Dual payment model created (new table vs. existing) | MEDIUM | Write a data migration to consolidate into one model before Phase 2 PayPal work begins. Audit which table the UI is writing to. Drop the extra table. |
| Chat history lost because wrong session key used | LOW | All future messages write to the correct session. Past messages are gone (no source of truth). If PYR DB persistence was implemented, history is recoverable from there. |
| Float precision bug creates €0.01 balance errors on existing payments | MEDIUM | Write a one-time fix script: `UPDATE payments SET amount = ROUND(amount / 100.0) * 100` (if stored with float rounding) or identify and correct specific rows. Audit all payments where `amount % 1 != 0`. |
| CalDAV VEVENT titles still show old single-guest format after migration | LOW | Trigger a re-sync via `POST /api/v1/calendar/sync` — the re-sync function in `calendar.service.ts` resets all records to pending and re-queues sync jobs. New VEVENTs overwrite old ones using the same stable UID. |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Breaking `guestId` contract across codebase (Pitfall 1) | Phase 1: Schema migration | `tsc --noEmit` across all packages passes with zero errors. Run `grep -r "\.guest\." packages/` and verify each callsite is updated. |
| Dual payment model confusion (Pitfall 2) | Phase 1: Schema decision | Schema review: only one payment model exists. `payments` table has `bookingId` added, `invoiceId` made nullable. No parallel table created. |
| Float precision in payment amounts (Pitfall 3) | Phase 2: Payment UI | Test: enter "99.99" — stored value must be exactly `9999`. Run `prisma studio` query: `SELECT amount FROM payments WHERE amount != FLOOR(amount)` must return 0 rows. |
| Race condition on payment double-submit (Pitfall 4) | Phase 2: Payment UI | Test: rapid double-click the "Add Payment" button — only one payment entry created. Check button is disabled while mutation is pending. |
| OpenClaw session key design (Pitfall 5) | Phase 3: Chat history | All chat messages use session key `"ines:primary"`. Reload the page — same messages appear. Switch from WhatsApp to dashboard chat — LLM remembers context. |
| OpenClaw has no native display history API (Pitfall 6) | Phase 3: Chat history | `GET /api/v1/assistant/messages` returns paginated message history. Page reload shows messages from DB, not React state. |
| Email-to-booking matching after multi-guest (Pitfall 7) | Phase 1: Schema migration | Test: send email from guest who is a secondary guest on a multi-guest booking. Verify conversation is linked to the booking in the inbox UI. |

---

## Sources

- Direct code inspection of `packages/backend/src/modules/bookings/booking.service.ts` — identified 3 `guestId` filter callsites
- Direct code inspection of `packages/backend/src/modules/notifications/notification.service.ts` — identified 2 `booking.guest.name` callsites that break on schema change
- Direct code inspection of `packages/backend/src/services/caldav/ical-builder.ts` — identified `guestName` parameter (singular) in `BuildBookingVeventParams`
- Direct code inspection of `packages/backend/src/services/caldav/caldav.service.ts` — identified `guest: { select: { name, email, phone } }` (singular include)
- Direct code inspection of `packages/assistant/openclaw-plugin/tools/bookings.ts` — identified `b.guest?.name`, `b.guest?.email`, `b.guest?.id` (all singular)
- Direct code inspection of `packages/assistant/openclaw-plugin/lib/confirmation.ts` — confirmed pending actions are in-memory Map with 1h TTL cleanup
- Direct code inspection of `openclaw/openclaw.json` — confirmed session key patterns for hooks; `sessions.json` is empty
- Direct code inspection of `packages/backend/prisma/schema.prisma` — confirmed existing `Invoice` and `Payment` models with `invoiceId` as non-nullable FK on `Payment`
- Direct code inspection of `packages/frontend/src/components/features/bookings/booking-detail.tsx` — single `booking.guest` card confirmed
- Direct code inspection of `packages/frontend/src/components/features/bookings/booking-form-dialog.tsx` — `guestId` as single field confirmed
- IEEE 754 floating-point arithmetic — known precision issue with cents multiplication
- GDPR Article 4(1) — IBAN as personal financial data

---
*Pitfalls research for: PYR v1.1 — multi-guest bookings, payment tracking, assistant chat history*
*Researched: 2026-02-24*
