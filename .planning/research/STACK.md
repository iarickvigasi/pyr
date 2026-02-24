# Stack Research — v1.1 Multi-Guest Bookings, Payment Tracking & Chat History

**Domain:** Extension of existing PYR business automation platform
**Researched:** 2026-02-24
**Confidence:** HIGH for schema/backend/frontend, MEDIUM for OpenClaw chat history (session format is internal, not versioned API)

**Scope:** This file covers ONLY what changes or is added for v1.1. The existing stack (Fastify 5, Next.js 15, Prisma 6.2.1, Redis 7, BullMQ, shadcn/ui, Zod, OpenClaw) is locked and proven. See the prior STACK.md entries (v1.0, 2026-02-19) for the original library research.

---

## Key Finding Up Front

**No new npm packages are required.** All three v1.1 features (multi-guest bookings, payment tracking, assistant chat history) are implemented with the existing stack via schema changes, new API endpoints, and built-in Node.js APIs (`fs/promises`, `readline`).

---

## Recommended Stack

### Core Technologies (locked — context only)

| Technology | Version | Why Not Changing |
|------------|---------|-----------------|
| Prisma | 6.2.1 | Prisma 7 is a major breaking upgrade (see "What NOT to Use"); stay on 6.x |
| Fastify 5 | 5.2.1 | Stable, no new plugin needed |
| PostgreSQL 16 | 16 | Schema additions via Prisma migration only |
| React + Next.js | 19 / 15.1.6 | Existing component patterns cover payment UI |
| shadcn/ui | current | Existing components (`Table`, `Dialog`, `Badge`) sufficient |
| Zod | 3.24.1 | No new schema patterns beyond existing |

---

### Feature 1: Multi-Guest Bookings

**What changes:** A new `BookingGuest` junction table joins `bookings` to `guests` for additional guests. The existing `Booking.guestId` FK stays as "primary guest" for backward compatibility with all 38 tools, calendar sync, conversation context, and existing includes.

**Pattern: Explicit many-to-many over implicit Prisma M2M**

Use an explicit junction model (not Prisma's implicit M2M via `@relation`). Rationale:
- Implicit M2M creates a hidden `_BookingToGuest` table that bypasses audit logging
- Explicit model can have `createdAt` for the join, enabling audit trail
- The `@@unique([bookingId, guestId])` constraint is clearer to express explicitly
- Independent querying ("find all bookings where guest X is an additional guest") is easier with explicit model
- Prisma docs recommend explicit when you need extra fields or custom naming — HIGH confidence

**New Prisma model to add:**

```prisma
model BookingGuest {
  id        String   @id @default(cuid())
  bookingId String   @map("booking_id")
  guestId   String   @map("guest_id")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  booking Booking @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  guest   Guest   @relation(fields: [guestId], references: [id])

  @@unique([bookingId, guestId])
  @@index([guestId])
  @@map("booking_guests")
}
```

**Also add to existing models:**
- `Booking`: add `additionalGuests BookingGuest[]`
- `Guest`: add `additionalBookings BookingGuest[]`

**Service pattern: replace-not-merge for guest sync**

```typescript
// In booking.service.ts — new helper, called inside $transaction
async function syncAdditionalGuests(
  tx: PrismaClientOrTx,
  bookingId: string,
  guestIds: string[],
): Promise<void> {
  await tx.bookingGuest.deleteMany({ where: { bookingId } });
  if (guestIds.length > 0) {
    await tx.bookingGuest.createMany({
      data: guestIds.map((guestId) => ({ bookingId, guestId })),
    });
  }
}
```

Replace-not-merge (delete all, recreate) avoids diff logic, is atomic within the transaction, and is idempotent. For a single-user system with small guest lists, the performance tradeoff is irrelevant.

**`createBooking` and `updateBooking` changes:** Accept optional `additionalGuestIds: string[]`. When provided, call `syncAdditionalGuests` inside the same `$transaction`. When absent, do not touch `booking_guests` rows (backward compatible for existing tool calls that don't pass the parameter).

**`getBooking` change:** Include `additionalGuests` with guest name/email in the Prisma `include`.

**Availability engine:** No change. Availability is per-room, not per-guest count. `RoomType.maxOccupancy` is the capacity constraint and already exists.

**Assistant plugin changes:** 3 additions:
1. Update `prepare_create_booking` tool: add optional `additionalGuestIds` parameter
2. Update `get_booking` tool: include additional guests in formatted output
3. Add `'add_booking_guest'` and `'remove_booking_guest'` to `PendingAction` type union in `confirmation.ts`

**No new packages.** Prisma's `createMany`, `deleteMany`, and `include` handle all of this.

---

### Feature 2: Payment Tracking

**What changes:** The existing `Payment` model is restructured so payments can exist directly on a booking without a `Invoice` intermediary. `invoiceId` becomes nullable. A required `bookingId` is added. A `notes` field is added for manual entry context.

**Pattern: Extend existing `Payment` model, not a new table**

The schema already has `Payment` linked through `Invoice`. Phase 2 will add PayPal invoices that also need payment records. If a separate `DirectPayment` table is created now, Phase 2 will need to merge or join two tables to show payment history. One table with nullable `invoiceId` avoids that.

**Modified `Payment` model:**

```prisma
model Payment {
  id         String        @id @default(cuid())
  bookingId  String        @map("booking_id")    // required — always linked to booking
  invoiceId  String?       @map("invoice_id")    // nullable — Phase 2 PayPal invoices
  amount     Int           // cents
  method     PaymentMethod
  notes      String?       // manual entry context
  receivedAt DateTime      @map("received_at") @db.Timestamptz(3)
  createdAt  DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)

  booking Booking  @relation(fields: [bookingId], references: [id])
  invoice Invoice? @relation(fields: [invoiceId], references: [id])

  @@index([bookingId])
  @@index([invoiceId])
  @@map("payments")
}
```

**`PaymentMethod` enum:** Already has `paypal`, `bank_transfer`, `cash`. These cover all v1.1 manual payment methods. No enum additions needed.

**Existing `Invoice` model:** The `Invoice.payments` relation already exists. Making `Payment.invoiceId` nullable requires updating the `Invoice` Prisma relation to allow zero payments, which is already possible.

**New API endpoints:**

```
GET    /api/v1/bookings/:id/payments         — list payments, newest first
POST   /api/v1/bookings/:id/payments         — log a payment (amount, method, receivedAt, notes)
DELETE /api/v1/bookings/:id/payments/:pid    — delete a mistakenly logged payment
```

Implement as a sub-resource in the `bookings` module (not a new module). Follows the existing pattern of `events/:id/registrations`.

**`PATCH /api/v1/bookings/:id`** for editable total price already works — `updateBooking` already accepts `totalPrice`. No new endpoint needed.

**`GET /api/v1/bookings/:id`** extended to include `payments` array. Already technically possible via Prisma `include`; just add it to the include statement.

**Balance calculation (paidAmount):** Computed at the service layer on read:
- `paidAmount = sum(payments.amount)` where `receivedAt <= now`
- `balance = booking.totalPrice - paidAmount`
- Return both in the `GET /api/v1/bookings/:id` response
- No stored computed column — recalculate on each read (payment lists are small, ≤ 20 entries per booking)

**Audit logging:** Every payment create/delete must call `writeAuditLog`. Follow the existing pattern — wrap in `$transaction` with the payment write.

**Frontend payment UI:** New components in `packages/frontend/src/components/features/bookings/`:
- `payment-history.tsx` — shadcn `Table` listing payments with amount, method, date, notes
- `log-payment-dialog.tsx` — shadcn `Dialog` with `react-hook-form` + Zod resolver
- Integrate into `booking-detail.tsx` via a new "Payments" tab or section

**No new packages.** shadcn `Table`, `Dialog`, and `Badge` are already installed. `react-hook-form` and Zod resolvers already in use.

**Assistant plugin additions:** 3 new tools
1. `list_booking_payments` — read-only, show balance + history
2. `prepare_log_payment` — two-step confirmation (financial mutation)
3. `prepare_delete_payment` — two-step confirmation (deletion)
- Add `'log_payment'` and `'delete_payment'` to `PendingAction` type union in `confirmation.ts`

---

### Feature 3: Assistant Chat History

**The problem:** `useAssistant` holds messages in React state. Page refresh loses all history. Ines wants to scroll back through previous conversations.

**How OpenClaw persists sessions (verified against installed v2026.2.22):**

OpenClaw writes all conversation turns to disk on the gateway host:
- Index: `~/.openclaw/agents/main/sessions/sessions.json` — maps `sessionKey -> { sessionId, updatedAt, ... }`
- Transcripts: `~/.openclaw/agents/main/sessions/<sessionId>.jsonl` — one JSON object per line

The installed project has `openclaw/` at the repo root mounted as a directory. The sessions index exists at `/Users/iavi/Projects/PYR/openclaw/agents/main/sessions/sessions.json` (confirmed — currently `{}`).

**JSONL transcript format (from `session-logs` skill documentation):**
```json
{ "type": "session", "timestamp": "..." }
{ "type": "message", "timestamp": "...", "message": { "role": "user", "content": [{ "type": "text", "text": "..." }] } }
{ "type": "message", "timestamp": "...", "message": { "role": "assistant", "content": [{ "type": "text", "text": "..." }], "usage": { "cost": { "total": 0.012 } } } }
```

Filter to `type === "message"` and `message.role in ["user", "assistant"]` to get human-readable turns. Tool result rows and system messages are separate entries — skip them.

**Recommended approach: Backend reads JSONL, exposes REST endpoint**

```
GET /api/v1/assistant/history?sessionKey=<key>
```

Backend:
1. Looks up `sessionKey` in `sessions.json` to get `sessionId`
2. Reads `sessions/<sessionId>.jsonl` line-by-line using Node.js built-in `readline.createInterface`
3. Parses each line, filters to `type === "message"` and `role in ["user", "assistant"]`
4. Returns `{ data: ChatMessage[] }` in the existing response format

Frontend:
- `useAssistant` hook calls this endpoint on mount (once, not polling)
- Populates initial `messages` state before any live messages
- If endpoint returns 404 or empty, starts with empty state (first use or session cleared)

**Configuration:** Add `OPENCLAW_SESSIONS_DIR` env var pointing to the sessions directory. Default: relative path from backend startup location. Docker volume already mounts `./openclaw` into the container.

**Why not the Gateway `sessions.list` RPC:** Confirmed via GitHub issue #20934 (merged v2026.2.22): the new REST endpoints (`GET /v1/sessions/status`, `POST /v1/sessions/reset`) return metadata only — they do NOT return transcript content. The `sessions.list` WebSocket RPC also returns only metadata (token counts, timestamps). Filesystem read is the only way to get transcripts. — MEDIUM confidence (internal API, not versioned)

**Why not mirror messages to PostgreSQL:** Adds a `assistant_messages` table, requires write on every SSE stream completion (complex — partial writes if stream is aborted), and duplicates what OpenClaw already stores. The JSONL approach reads what OpenClaw already wrote for free.

**Graceful degradation:** If `OPENCLAW_SESSIONS_DIR` is not set, or the file doesn't exist, the endpoint returns `{ data: [] }`. The frontend shows an empty chat (current behavior). History is best-effort, not critical path.

**No new packages.** Node.js built-in `fs/promises`, `readline` (createInterface with line events), and `path` handle JSONL reading.

---

## Supporting Libraries (all existing)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Prisma | 6.2.1 | Schema migrations | Already installed — run `prisma migrate dev` |
| Zod | 3.24.1 | Schemas for new endpoints | Already installed |
| shadcn `Table` | current | Payment history table | Check `components/ui/table.tsx` exists |
| shadcn `Dialog` | current | Log-payment modal | `components/ui/dialog.tsx` exists |
| shadcn `Badge` | current | Payment method label | `components/ui/badge.tsx` exists |
| `readline` | Node built-in | Parse JSONL line-by-line | No install needed |
| `fs/promises` | Node built-in | Read session files | No install needed |
| `react-hook-form` | 7.71.1 | Payment log form | Already installed |
| `@hookform/resolvers` | 3.10.0 | Zod resolver for form | Already installed |

---

## Installation

**No new packages.** The only command needed is the Prisma migration:

```bash
# From packages/backend/
pnpm prisma migrate dev --name add-booking-guests-payment-direct
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Explicit `BookingGuest` junction table | Prisma implicit M2M (`@@relation`) | Implicit creates hidden `_BookingToGuest` table that bypasses audit logging and complicates custom queries |
| Keep `Booking.guestId` (primary guest) + add junction for additional guests | Replace `guestId` FK with junction-only | 38 tools, calendar sync, and all `include` statements rely on `guestId`; migration risk too high |
| Extend `Payment` with nullable `invoiceId` + required `bookingId` | New `DirectPayment` table | Phase 2 PayPal payments must coexist with manual payments in history view; separate tables require union queries |
| Read OpenClaw JSONL files from backend | Mirror chat to PostgreSQL `assistant_messages` | Complex failure modes (stream aborts mid-write), duplicates existing storage, adds a new table and ongoing write path |
| Read JSONL files via `fs/promises` + `readline` | Use OpenClaw Gateway `sessions.list` RPC or new REST endpoints | Confirmed: neither RPC nor REST endpoints return transcript content — only metadata |
| `syncAdditionalGuests` (delete-all + createMany) | Diff-based sync (add missing, remove extra) | Delete-all is atomic, simple, idempotent; diff logic adds complexity with no benefit for small guest lists |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Prisma 7.x | Breaking changes: `prisma-client-js` generator renamed to `prisma-client`, mandatory `output` field, env vars not auto-loaded, all databases require driver adapters (`@prisma/adapter-pg`), connection pool defaults changed, client middleware API removed. Moderately complex migration, not justified mid-feature. | Stay on Prisma 6.2.1 — stable, fully featured, no migration needed |
| Separate `DirectPayment` table | Fragments payment history into two tables; Phase 2 PayPal invoices will need to join both for a unified view | Extend existing `Payment` with nullable `invoiceId` and required `bookingId` |
| OpenClaw Gateway transcript API | Does not exist — neither `sessions.list` RPC nor new REST endpoints expose message content | Read JSONL transcript files directly via Node.js `readline` |
| Polling chat history | Adds unnecessary load; OpenClaw session data only changes when a message is sent; the dashboard proxies streaming in real-time | Single fetch on page/session mount |
| `grammy` or Telegram Bot API | Telegram was the original plan; OpenClaw replaced it in Phase 07. The `grammy` stub in `packages/assistant/package.json` should remain a stub — do not build on it for v1.1 | OpenClaw plugin SDK for all assistant tool additions |

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| Prisma | 6.2.1 | PostgreSQL 16 | Stable; new `BookingGuest` model is a standard migration |
| `@prisma/client` | 6.2.1 | Existing schema + new models | Run `prisma generate` after schema change |
| Zod | 3.24.1 | `zod-openapi` 4.2.4 | No change; existing range sufficient |
| OpenClaw | 2026.2.22 | JSONL session format | Format verified against installed version; treat as internal/unstable — test before relying on it |

---

## Environment Variables (new)

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENCLAW_SESSIONS_DIR` | `../../openclaw/agents/main/sessions` (relative to backend) | Path to OpenClaw session JSONL files. Used by `GET /api/v1/assistant/history`. Not required — gracefully returns empty if unset. |

---

## Sources

- Prisma 7 upgrade guide — `prisma.io/docs/orm/more/upgrade-guides/upgrading-versions` — confirmed breaking changes; recommending stay on 6.x — HIGH confidence
- Prisma many-to-many docs — `prisma.io/docs/orm/prisma-schema/data-model/relations/many-to-many-relations` — explicit junction table pattern — HIGH confidence
- OpenClaw session docs — `docs.openclaw.ai/concepts/session` and `openclaw.im/docs/concepts/session` — JSONL transcript storage location, `sessions.json` index structure — MEDIUM confidence (internal format)
- OpenClaw `session-logs` skill — `playbooks.com/skills/openclaw/openclaw/session-logs` — JSONL format: `type`, `message.role`, `message.content[]` with `type=='text'` filter — MEDIUM confidence
- OpenClaw GitHub issue #20934 — confirmed REST session endpoints added in v2026.2.22 (installed); transcript content NOT exposed via REST or RPC — MEDIUM confidence (secondary source)
- Existing codebase: `packages/backend/prisma/schema.prisma` — current `Payment` model structure, existing `PaymentMethod` enum — HIGH confidence (direct read)
- Existing codebase: `packages/assistant/openclaw-plugin/lib/confirmation.ts` — `PendingAction` type union — HIGH confidence (direct read)
- Existing codebase: `openclaw/agents/main/sessions/sessions.json` — confirmed sessions directory exists, currently `{}` — HIGH confidence (direct read)
- Existing codebase: `openclaw/update-check.json` — installed OpenClaw version `2026.2.22-2` — HIGH confidence (direct read)

---

*Stack research for: PYR v1.1 — Multi-Guest Bookings, Payment Tracking, Assistant Chat History*
*Researched: 2026-02-24*
