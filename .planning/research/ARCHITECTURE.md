# Architecture Research

**Domain:** Extending existing Fastify/Next.js/OpenClaw business automation platform
**Researched:** 2026-02-24
**Confidence:** HIGH — all findings derived from direct codebase inspection

---

## Executive Summary

This research covers the integration architecture for three new features added to the PYR v1.1 milestone: multi-guest bookings, payment tracking, and assistant chat history. The existing codebase is well-structured with a clean module pattern. The findings below identify every file that must be created or modified, the data flow for each feature, and the recommended build order.

The hardest dependency is the schema migration: replacing the single `guestId` FK on `bookings` with a `booking_guests` junction table is a breaking change that must happen first. Everything else follows from that.

---

## System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js 15)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │ BookingDetail │  │ ChatContainer │  │  (new) PaymentPanel   │   │
│  │  (MODIFIED)  │  │  (MODIFIED)  │  │      (NEW)             │   │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬───────────┘   │
│         │                  │                        │               │
│         └──────────────────┴────────────────────────┘              │
│                            │  React Query / fetch + SSE             │
└────────────────────────────┼───────────────────────────────────────┘
                             │ HTTP REST
┌────────────────────────────┼───────────────────────────────────────┐
│                  Backend (Fastify 5 + Prisma)                       │
│                             │                                       │
│  ┌──────────────────────────┼────────────────────────────────────┐ │
│  │             src/modules/                                        │ │
│  │  ┌──────────────┐  ┌────┴──────┐  ┌────────────────────────┐ │ │
│  │  │   bookings/  │  │ assistant/ │  │  invoices/ (IMPLEMENT  │ │ │
│  │  │  (MODIFIED)  │  │ (MODIFIED) │  │  stub -> real)         │ │ │
│  │  └──────┬───────┘  └────┬───────┘  └──────────┬────────────┘ │ │
│  └─────────┼────────────────┼──────────────────────┼─────────────┘ │
│            │                │                       │               │
│  ┌─────────┼────────────────┼──────────────────────┼─────────────┐ │
│  │         Prisma ORM -> PostgreSQL 16                             │ │
│  │  ┌────────────────┐  ┌──────────────────┐  ┌───────────────┐ │ │
│  │  │  bookings +    │  │  invoices +       │  │ (optional)    │ │ │
│  │  │  booking_guests│  │  payments (notes) │  │ chat_turns    │ │ │
│  │  │  (junction NEW)│  │  (EXTENDED)       │  │ (NEW)         │ │ │
│  │  └────────────────┘  └──────────────────┘  └───────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  src/services/caldav/  (MODIFIED)                            │  │
│  │  ical-builder.ts: guestName -> guestNames[]                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                  │ WebSocket (GatewayWsClient)
┌─────────────────┼───────────────────────────────────────────────────┐
│              OpenClaw Gateway (external process)                     │
│                 │                                                    │
│  HTTP: /v1/chat/completions (OpenAI-compatible SSE)                 │
│  Sessions: in-memory (keyed by user: field), no disk persistence    │
│  openclaw/agents/main/sessions/sessions.json = {}                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Responsibility | Location |
|-----------|----------------|----------|
| `booking.service.ts` | CRUD, status machine, overlap check | `modules/bookings/booking.service.ts` |
| `booking.routes.ts` | HTTP endpoints, calendar sync enqueue | `modules/bookings/booking.routes.ts` |
| `booking.schema.ts` | Zod validation for request/response | `modules/bookings/booking.schema.ts` |
| `caldav.service.ts` | Push VEVENTs to Apple Calendar via CalDAV | `services/caldav/caldav.service.ts` |
| `ical-builder.ts` | Build iCal VEVENT strings | `services/caldav/ical-builder.ts` |
| `BookingDetail` | Frontend booking page | `components/features/bookings/booking-detail.tsx` |
| `use-bookings.ts` | React Query hooks for booking API | `lib/hooks/use-bookings.ts` |
| `ChatContainer` | Frontend assistant chat UI | `components/features/assistant/chat-container.tsx` |
| `use-assistant.ts` | SSE streaming, session key management | `lib/hooks/use-assistant.ts` |
| `assistant.routes.ts` | Proxy to OpenClaw HTTP API | `modules/assistant/assistant.routes.ts` |
| `GatewayWsClient` | WebSocket connection to OpenClaw | `services/gateway/gateway-ws-client.ts` |
| `invoice.service.ts` | Payment tracking (currently empty stub) | `modules/invoices/invoice.service.ts` |
| OpenClaw plugin tools | 38 tools hitting PYR backend via X-API-Key | `packages/assistant/openclaw-plugin/tools/` |

---

## Feature 1: Multi-Guest Bookings

### Current State

The `bookings` table has a single `guestId` FK. One booking = one guest.

```prisma
// CURRENT schema.prisma
model Booking {
  guestId String @map("guest_id")
  guest   Guest  @relation(fields: [guestId], references: [id])
  ...
}
model Guest {
  bookings Booking[]  // back-relation
  ...
}
```

`booking.service.ts` accepts `guestId: string`, verifies the guest exists in the transaction, and uses `include: { guest: ... }` on all queries. The `types/entities.ts` `Booking` type has `guestId: string` and `BookingWithRelations` has `guest: Pick<Guest, ...>`.

### Required Schema Change

Replace `guestId` FK with a junction table.

```prisma
// NEW — to add to schema.prisma
model BookingGuest {
  bookingId String @map("booking_id")
  guestId   String @map("guest_id")

  booking Booking @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  guest   Guest   @relation(fields: [guestId], references: [id])

  @@id([bookingId, guestId])
  @@index([guestId])
  @@map("booking_guests")
}

// UPDATED Booking model
model Booking {
  // Remove: guestId String @map("guest_id")
  // Remove: guest   Guest  @relation(...)
  bookingGuests BookingGuest[]
  ...
}

// UPDATED Guest model
model Guest {
  // Remove: bookings Booking[]
  bookingGuests BookingGuest[]
  ...
}
```

This is a **breaking migration**. Use two Prisma migrations:

1. Migration A: Create `booking_guests`, INSERT from existing `guest_id`, keep old column.
2. Migration B (after app ships): DROP `guest_id` column.

Or combine with a raw SQL step in a single migration if the deployment can tolerate a brief downtime window.

### Integration Points: What Changes

**`packages/backend/prisma/schema.prisma` (MODIFIED):**
- Add `BookingGuest` model.
- Remove `guestId`/`guest` from `Booking`.
- Remove `bookings` from `Guest`, replace with `bookingGuests`.
- Prisma migration required.

**`packages/backend/src/modules/bookings/booking.service.ts` (MODIFIED):**
- `createBooking`: Accept `guestIds: string[]`. Verify all guests exist in the transaction. INSERT N rows into `booking_guests`.
- `listBookings`: Change `include: { guest: ... }` to `include: { bookingGuests: { include: { guest: { select: ... } } } }`. Return `guests[]` array.
- `getBooking`: Same include change.
- `listBookings` `guestId` filter: Change `where.guestId = query.guestId` to `where.bookingGuests = { some: { guestId: query.guestId } }`.
- `updateBooking`: Optionally accept `addGuestIds`/`removeGuestIds` for guest management. Can be deferred.

**`packages/backend/src/modules/bookings/booking.schema.ts` (MODIFIED):**
- Replace `guestId: z.string().min(1)` with `guestIds: z.array(z.string().min(1)).min(1)`.
- `listBookingsQuerySchema`: `guestId` filter stays as-is (still filtering by a single guest ID).

**`packages/backend/src/types/entities.ts` (MODIFIED):**
- `Booking` type: Remove `guestId: string`. Add `bookingGuests?: BookingGuestWithGuest[]`.
- `BookingWithRelations`: Remove `guest: Pick<Guest, ...>`. Add `guests: Pick<Guest, ...>[]`.
- Add `BookingGuestWithGuest` type.
- `GuestDetailWithRelations`: Change `bookings: GuestBookingWithRoom[]` to navigate via `bookingGuests`.

**`packages/backend/src/modules/guests/guest.service.ts` (MODIFIED):**
- `getGuestDetail()`: Loads `bookings` via back-relation. Must change to `bookingGuests: { include: { booking: { include: { room: ... } } } }`.

**`packages/backend/src/modules/dashboard/dashboard.service.ts` (MODIFIED):**
- `getToday()`: `b.guest.name` in `checkInBookings.map(...)` must change to `b.bookingGuests[0]?.guest.name ?? 'Unknown'` or a comma-joined list.

**`packages/backend/src/services/caldav/caldav.service.ts` (MODIFIED):**
- `syncBookingToCalendar()`: Currently `include: { guest: { select: { name, email, phone } } }`. Must change to `include: { bookingGuests: { include: { guest: { select: { name, email, phone } } } } }`.
- Pass `guestNames: string[]` to `buildBookingVevent`.

**`packages/backend/src/services/caldav/ical-builder.ts` (MODIFIED):**
- `BookingVeventParams.guestName: string` → `guestNames: string[]`.
- VEVENT `summary`: `"Guest 1, Guest 2 — Room Name"`. Description lists all guests with their contact info.

**`packages/backend/src/services/ai/context-builder.ts` (MODIFIED — verify):**
- Loads booking context for AI draft generation. If it accesses `booking.guest`, must update to `booking.bookingGuests[0]?.guest` or iterate guests.

**`packages/backend/src/modules/notifications/notification.service.ts` (MODIFIED — verify):**
- `sendNewBookingAlert` receives `booking.id` and loads booking data. Must update guest name resolution.

**`packages/frontend/src/lib/hooks/use-bookings.ts` (MODIFIED):**
- Type definitions: `guest: { id, name, email, phone, language }` → `guests: Array<{ id, name, email, phone, language }>`.
- Mutation types for create: `guestId: string` → `guestIds: string[]`.

**`packages/frontend/src/components/features/bookings/booking-detail.tsx` (MODIFIED):**
- Guest card: currently shows single guest. Render list of guests (cards or rows).

**`packages/frontend/src/components/features/bookings/booking-form-dialog.tsx` (MODIFIED):**
- Single guest selector → multi-select with guest search. Can use a combobox with `multiple` support.

**`packages/frontend/src/components/features/bookings/booking-table.tsx` (MODIFIED):**
- Guest column: `booking.guest.name` → first guest name + overflow count: `"Anna Schmidt + 1 other"`.

**`packages/assistant/openclaw-plugin/tools/bookings.ts` (MODIFIED):**
- `Booking` interface: `guest?: { ... }` → `guests?: Array<{ ... }>`.
- `formatBooking()` / `formatBookingDetail()`: `guestName: b.guest?.name` → `guestNames: b.guests?.map(g => g.name).join(', ')`.
- `prepare_create_booking` tool: Accept multiple guest IDs.

---

## Feature 2: Payment Tracking

### Current State

Schema has `Invoice` (linked to booking + guest, has `invoiceNumber UNIQUE`, `paypalInvoiceId`) and `Payment` (linked to invoice, has `amount`, `method`, `receivedAt`). Both tables exist but:

- `invoice.service.ts` — empty stub (`export {}`)
- `invoice.routes.ts` — empty Fastify plugin with no endpoints
- `invoice.schema.ts` — empty stub

The `Payment` model has no `notes` field. The calendar sync `paymentStatus` is a hardcoded heuristic (`totalPrice > 0 ? 'Unpaid' : 'N/A'`).

### Design: Auto-Invoice Pattern

The milestone requires manual payment tracking without PayPal. Two clean options exist:

**Option A (recommended): Auto-invoice per booking.** When the first payment is logged against a booking, automatically create an `Invoice` record if none exists. `invoiceNumber` auto-generated as `INV-{8-char bookingId suffix}`. This preserves the Phase 2 PayPal path and requires no schema additions beyond adding `notes` to `Payment`.

**Option B: Direct booking payments table.** Add a new `booking_payments` table bypassing `Invoice`. Simpler short-term, but diverges from Phase 2 design and creates two payment storage paths.

Go with Option A. The invoice overhead is minimal and the Phase 2 path stays clean.

### Schema Changes

```prisma
// Extend Payment with notes (ADD to existing model)
model Payment {
  id         String        @id @default(cuid())
  invoiceId  String        @map("invoice_id")
  amount     Int           // cents
  method     PaymentMethod
  notes      String?       // NEW: "50% deposit, bank transfer ref: TRX12345"
  receivedAt DateTime      @map("received_at") @db.Timestamptz(3)
  createdAt  DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)

  invoice Invoice @relation(fields: [invoiceId], references: [id])

  @@index([invoiceId])
  @@map("payments")
}
```

No changes to `Invoice` model. `invoiceNumber` stays UNIQUE. `paypalInvoiceId` stays nullable (null for manual invoices).

### New Service Implementation

**`packages/backend/src/modules/invoices/invoice.service.ts` (IMPLEMENT — replaces stub):**

```typescript
// Key functions to implement

// Idempotent: find existing invoice or create auto-invoice for the booking
getOrCreateInvoiceForBooking(prisma, bookingId): Promise<Invoice>

// Log a payment: get/create invoice, INSERT payment, recalculate status, audit log — all in $transaction
addPayment(prisma, bookingId, { amount, method, notes, receivedAt }, actorId): Promise<Payment>

// List all payments for a booking (via its invoice)
listPayments(prisma, bookingId): Promise<Payment[]>

// Delete a single payment and recalculate invoice status
deletePayment(prisma, paymentId, actorId): Promise<void>

// Computed summary: { totalPrice, amountPaid, balance, invoiceStatus }
getPaymentSummary(prisma, bookingId): Promise<PaymentSummary>
```

Invoice status logic:
- `amountPaid === 0` → `draft`
- `amountPaid > 0 && amountPaid < totalPrice` → `sent` (partial, reusing existing status)
- `amountPaid >= totalPrice` → `paid`

**`packages/backend/src/modules/invoices/invoice.schema.ts` (IMPLEMENT — replaces stub):**
- `addPaymentSchema`: `{ amount: Int (cents), method: enum, notes?: string, receivedAt: ISO date string }`
- `paymentSummarySchema`: `{ totalPrice, amountPaid, balance, invoiceStatus }`
- `listPaymentsResponseSchema`: array of payment objects

**`packages/backend/src/modules/invoices/invoice.routes.ts` (IMPLEMENT — replaces stub):**

```
GET  /api/v1/bookings/:id/payments          List payments + summary
POST /api/v1/bookings/:id/payments          Add a payment
DELETE /api/v1/bookings/:id/payments/:pid   Remove a payment
```

Register as sub-routes within the bookings prefix. In `app.ts`, these can be registered separately under `/api/v1/bookings` or the booking routes can import and register them inline.

**`packages/backend/src/app.ts` (MODIFIED):**
- Register invoice routes: `app.register(invoiceRoutes, { prefix: '/api/v1/bookings' })`.

**`packages/backend/src/services/caldav/caldav.service.ts` (ENHANCED):**
- `paymentStatus` currently hardcoded heuristic. After implementing payment tracking, compute the real status by calling `getPaymentSummary` (or inline the query). This gives accurate "Paid", "Partial", "Unpaid" in the Apple Calendar VEVENT.
- After adding/deleting a payment: enqueue a `calendar-sync` job so VEVENT description reflects the new payment status.

**`packages/backend/src/modules/bookings/booking.routes.ts` (MODIFIED):**
- After `POST /` (create booking) and `PATCH /:id` (update booking where totalPrice changes): optionally re-enqueue calendar sync to refresh payment status.

### Frontend Changes

**`packages/frontend/src/components/features/bookings/payment-panel.tsx` (NEW):**
- Shows balance display: total price / amount paid / remaining balance.
- Payment history table (date, method, amount, notes, delete button).
- "Log Payment" button → dialog with amount/method/date/notes fields.

**`packages/frontend/src/lib/hooks/use-payments.ts` (NEW):**
- `usePayments(bookingId)`: `GET /api/v1/bookings/:id/payments`
- `useAddPayment()`: `POST /api/v1/bookings/:id/payments`
- `useDeletePayment()`: `DELETE /api/v1/bookings/:id/payments/:pid`
- All mutations invalidate `queryKeys.payments(bookingId)` on success.

**`packages/frontend/src/components/features/bookings/booking-detail.tsx` (MODIFIED):**
- Add `<PaymentPanel bookingId={id} totalPrice={booking.totalPrice} />` card below existing cards.

**`packages/assistant/openclaw-plugin/tools/bookings.ts` (MODIFIED):**
- `get_booking` response: include `paymentSummary: { amountPaid, balance, paymentStatus }`.

**`packages/assistant/openclaw-plugin/tools/bookings.ts` (EXTENDED — optional):**
- New tool `log_payment`: two-step confirmation (prepare shows amount + balance-after, confirm calls POST endpoint).

**`openclaw/workspace/TOOLS.md` (UPDATED):**
- Document payment summary in `get_booking` and the new `log_payment` tool.

---

## Feature 3: Assistant Chat History

### Current State

```typescript
// packages/frontend/src/lib/hooks/use-assistant.ts

// On every mount, generates a NEW timestamp-based session key
const [sessionKey, setSessionKey] = useState<string>(() => {
  const fresh = `dashboard:${Date.now()}`;  // always new
  storeSessionKey(fresh);
  return fresh;
});
```

A `DEFAULT_SESSION_KEY = 'dashboard:ines'` is defined but never used — it's immediately overwritten. The `getStoredSessionKey()` function exists and reads from localStorage, but the `useState` initializer doesn't call it.

On the backend, `assistant.routes.ts` sends each user message to OpenClaw as a standalone POST:

```typescript
body: JSON.stringify({
  model: '...',
  messages: [{ role: 'system', ... }, { role: 'user', content: message }],
  stream: true,
  user: sessionKey,  // OpenClaw uses this as the session identifier
})
```

OpenClaw maintains conversation history server-side by `user` (session key). The `openclaw/agents/main/sessions/sessions.json` is currently `{}` — **sessions are in-memory only and do not survive gateway restarts**.

The `resetSession()` function generates a new key, stores it in localStorage, and clears React state. This correctly starts a new conversation.

### The Problem

1. Page reload generates a brand new session key. The previous conversation is abandoned even if the OpenClaw gateway is still running with that session in memory.
2. Gateway restarts wipe all sessions. No persistence at all currently.

### Architecture Options

**Option C — Stable session key (1-line fix, immediate improvement):**
Change the `useState` initializer from always generating fresh to using `getStoredSessionKey()`. The previous session key is restored from localStorage on reload. Within the same gateway lifecycle, conversation context is preserved.

```typescript
// BEFORE
const [sessionKey, setSessionKey] = useState<string>(() => {
  const fresh = `dashboard:${Date.now()}`;
  storeSessionKey(fresh);
  return fresh;
});

// AFTER
const [sessionKey, setSessionKey] = useState<string>(() => {
  return getStoredSessionKey();  // use stored key, only generate fresh if none exists
});
```

This is the quick win. Zero backend changes. Zero schema changes. Delivers "session continuity within gateway lifecycle".

**Option B — PYR-DB-backed chat history (full persistence):**
Store conversation turns in a new `chat_turns` table. The `assistant.routes.ts` backend proxy accumulates the streaming response, then writes user + assistant turns to the DB after stream completion. New endpoints serve history retrieval.

```prisma
model ChatTurn {
  id         String   @id @default(cuid())
  sessionKey String   @map("session_key")
  role       String   // 'user' | 'assistant'
  content    String   @db.Text
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([sessionKey, createdAt])
  @@map("chat_turns")
}
```

New backend:
```
GET /api/v1/assistant/sessions              List recent sessions (distinct keys + last activity)
GET /api/v1/assistant/sessions/:sessionKey  Get turns for a session (last N)
DELETE /api/v1/assistant/sessions/:sessionKey  Clear a session history
```

Frontend changes:
- On mount: if stored session key exists, `GET /api/v1/assistant/sessions/:key` and pre-populate `messages` state.
- History panel: button to browse past sessions.

**Recommendation: Implement Option C first (trivial), then Option B as the "chat history" feature proper.** Option C takes one minute and gives meaningful improvement. Option B delivers the "persistent conversations" milestone feature.

### Integration Points for Option B

**`packages/backend/prisma/schema.prisma` (MODIFIED):**
- Add `ChatTurn` model.

**`packages/backend/src/modules/assistant/assistant.routes.ts` (MODIFIED):**
- After the SSE stream completes, write user message + assembled assistant response as two `ChatTurn` rows.
- Add `GET /sessions` and `GET /sessions/:key` endpoints.
- On `POST /chat/reset`: optionally mark old session as archived (or just leave it queryable).

**New: `packages/backend/src/modules/assistant/chat-history.service.ts`:**
- `saveTurns(prisma, sessionKey, userMessage, assistantContent)`: Two-row insert, not in $transaction (failures are non-critical — the conversation succeeded even if history write fails).
- `getSession(prisma, sessionKey)`: Returns all turns ordered by `createdAt` asc.
- `listSessions(prisma)`: Returns distinct session keys with latest turn timestamp.

**`packages/frontend/src/lib/hooks/use-assistant.ts` (MODIFIED):**
- On mount: if session key exists in localStorage, fetch session history and hydrate `messages` state.
- Expose `sessions` query and `loadSession(key)` function.

**Optional: `packages/frontend/src/components/features/assistant/chat-history-panel.tsx` (NEW):**
- Lists past sessions with timestamps. Click to load session turns.

---

## Data Flow Summary

### Multi-Guest Booking Create

```
Frontend BookingFormDialog
  POST /api/v1/bookings { guestIds: ['id1', 'id2'], roomId, checkIn, checkOut, ... }
    booking.routes.ts
      booking.service.ts:createBooking({ guestIds })
        $transaction:
          verify all guestIds exist in guests table
          checkOverlap(roomId, checkIn, checkOut)
          INSERT INTO bookings (no guestId)
          INSERT INTO booking_guests (booking_id, guest_id) x N
          writeAuditLog('booking', bookingId, 'create', ...)
        return booking
      enqueueCalendarSync('create')
        calendar-sync BullMQ job
          caldav.service.ts:syncBookingToCalendar()
            load booking with bookingGuests[].guest
            ical-builder:buildBookingVevent({ guestNames: ['Anna', 'Klaus'] })
            PUT to iCloud CalDAV
```

### Payment Logging

```
Frontend PaymentPanel "Log Payment" dialog
  POST /api/v1/bookings/:id/payments { amount: 45000, method: 'bank_transfer', notes: '...', receivedAt: '2026-03-15' }
    invoice.routes.ts
      invoice.service.ts:addPayment(prisma, bookingId, { ... }, actorId)
        $transaction:
          getOrCreateInvoiceForBooking(bookingId)
            find existing invoice by bookingId OR create auto-invoice
          INSERT INTO payments (invoice_id, amount, method, notes, received_at)
          recalculate invoice.status (draft/sent/paid)
          UPDATE invoices SET status = ...
          writeAuditLog('payment', paymentId, 'create', ...)
        return payment
      enqueueCalendarSync('update')  // refresh payment status in VEVENT description
  React Query invalidates payments(bookingId) -> re-fetches summary
```

### Assistant Chat (Option C + B combined)

```
Page load:
  use-assistant.ts:useState
    getStoredSessionKey()  // stable key from localStorage
    if key exists: GET /api/v1/assistant/sessions/:key
      -> hydrate messages[] state from ChatTurn rows

User sends message:
  use-assistant.ts:sendMessage(text)
    POST /api/v1/assistant/chat { message: text, sessionKey }
      assistant.routes.ts
        fetch OpenClaw /v1/chat/completions { user: sessionKey, messages: [...], stream: true }
          OpenClaw: loads session history, calls LLM, streams SSE
        pipe SSE stream to frontend client
        (after stream done) chat-history.service.ts:saveTurns(sessionKey, text, assembledResponse)
          INSERT chat_turns (user turn + assistant turn)
```

---

## New vs Modified: Complete File List

### New Files

| File | Purpose |
|------|---------|
| `packages/backend/src/modules/assistant/chat-history.service.ts` | Chat turn read/write (Option B) |
| `packages/frontend/src/components/features/bookings/payment-panel.tsx` | Payment UI: balance + history + log form |
| `packages/frontend/src/lib/hooks/use-payments.ts` | React Query hooks for payment endpoints |
| `packages/frontend/src/components/features/assistant/chat-history-panel.tsx` | Past sessions browser (Option B, optional) |

### Modified Files

| File | What Changes |
|------|-------------|
| `packages/backend/prisma/schema.prisma` | Add `BookingGuest` junction; `notes` on `Payment`; `ChatTurn` (opt) |
| `packages/backend/src/modules/bookings/booking.service.ts` | Multi-guest CRUD, query includes, guestId filter via junction |
| `packages/backend/src/modules/bookings/booking.schema.ts` | `guestId → guestIds: string[]` |
| `packages/backend/src/modules/bookings/booking.routes.ts` | Register payment sub-routes |
| `packages/backend/src/modules/invoices/invoice.service.ts` | Implement (was empty stub) |
| `packages/backend/src/modules/invoices/invoice.schema.ts` | Implement (was empty stub) |
| `packages/backend/src/modules/invoices/invoice.routes.ts` | Implement (was empty stub) |
| `packages/backend/src/app.ts` | Register invoice routes under `/api/v1/bookings` prefix |
| `packages/backend/src/types/entities.ts` | `Booking`, `BookingWithRelations`, `GuestDetailWithRelations` types |
| `packages/backend/src/modules/guests/guest.service.ts` | Navigate bookings via `bookingGuests` junction |
| `packages/backend/src/modules/dashboard/dashboard.service.ts` | `b.guest.name` → from junction |
| `packages/backend/src/services/caldav/caldav.service.ts` | Load `bookingGuests`, pass `guestNames[]` |
| `packages/backend/src/services/caldav/ical-builder.ts` | `guestName: string` → `guestNames: string[]` |
| `packages/backend/src/services/ai/context-builder.ts` | Multi-guest booking context (verify if accesses `booking.guest`) |
| `packages/backend/src/modules/notifications/notification.service.ts` | Guest name via junction |
| `packages/backend/src/modules/assistant/assistant.routes.ts` | Chat turn persistence (Option B); session list endpoints |
| `packages/frontend/src/lib/hooks/use-bookings.ts` | Type updates: `guest → guests[]` |
| `packages/frontend/src/components/features/bookings/booking-detail.tsx` | Multi-guest display + PaymentPanel |
| `packages/frontend/src/components/features/bookings/booking-form-dialog.tsx` | Multi-select guest input |
| `packages/frontend/src/components/features/bookings/booking-table.tsx` | Guest column multi-guest display |
| `packages/frontend/src/lib/hooks/use-assistant.ts` | Session key stability fix + optional history hydration |
| `packages/assistant/openclaw-plugin/tools/bookings.ts` | Multi-guest types, payment summary in `get_booking` |
| `openclaw/workspace/TOOLS.md` | Document new payment tool and updated booking response |

---

## Recommended Build Order

**Rationale:** The schema migration is the hard dependency. CalDAV works with the old schema until migrated. Frontend is decoupled by API contract and can be built in parallel with backend once types are agreed.

### Phase 1: Schema Foundation (unblocks all other work)
1. Add `BookingGuest` junction table to `schema.prisma`
2. Add `notes` to `Payment` model
3. Add `ChatTurn` model (if Option B in scope)
4. Write data migration: copy `bookings.guest_id` rows to `booking_guests`
5. Drop `bookings.guest_id` column (or do in Phase 2 after backend ships)
6. `npx prisma migrate dev`, verify `prisma generate`, update TypeScript types

### Phase 2: Backend — Multi-Guest (high blast radius, do before payment work)
7. Update `booking.service.ts` (multi-guest CRUD, query updates)
8. Update `booking.schema.ts` (`guestIds` array)
9. Update `types/entities.ts`
10. Update `guest.service.ts` (bookings via junction)
11. Update `dashboard.service.ts` (guest names from junction)
12. Update `caldav.service.ts` + `ical-builder.ts` (multi-guest VEVENT)
13. Verify `context-builder.ts` and `notification.service.ts` still work
14. Fix booking integration tests

### Phase 3: Backend — Payments (standalone, fewer dependencies)
15. Implement `invoice.service.ts`
16. Implement `invoice.schema.ts`
17. Implement `invoice.routes.ts`
18. Register in `app.ts`
19. Calendar sync enhancement: compute real payment status for VEVENT
20. Write payment endpoint tests

### Phase 4: Frontend — Multi-Guest + Payments
21. Update `use-bookings.ts` types
22. Update `booking-form-dialog.tsx` (multi-select guest input)
23. Update `booking-detail.tsx` (multi-guest display card)
24. Update `booking-table.tsx` (guest column)
25. Build `payment-panel.tsx`
26. Build `use-payments.ts`
27. Wire PaymentPanel into `booking-detail.tsx`

### Phase 5: OpenClaw Plugin Updates
28. Update `tools/bookings.ts` (multi-guest types, payment summary in `get_booking`)
29. Add `log_payment` tool (prepare + confirm pattern)
30. Update `TOOLS.md`

### Phase 6: Chat History
31. Option C (1-line fix): Change `useState` in `use-assistant.ts` to use `getStoredSessionKey()`
32. Option B (full): Implement `chat-history.service.ts`
33. Option B: Add session endpoints to `assistant.routes.ts`
34. Option B: Update `use-assistant.ts` to hydrate history on mount
35. Option B (optional): Build `chat-history-panel.tsx`

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Adding a "Primary Guest" FK alongside the junction table

**What people do:** Add `primaryGuestId` back to `bookings` as a convenience shortcut.

**Why it's wrong:** Two sources of truth. Callers diverge. `primaryGuestId` goes stale when guests are added/removed from the booking.

**Do this instead:** Derive "primary guest" in the service layer as `bookingGuests[0].guest`. Never persist it as a separate column.

### Anti-Pattern 2: Writing payments directly in invoice.routes.ts

**What people do:** `app.prisma.payment.create(...)` directly in the route handler to save time.

**Why it's wrong:** Bypasses audit trail. Project rule: all mutations go through service → `$transaction` → `writeAuditLog`. Route handlers must call `invoice.service.ts:addPayment()`.

### Anti-Pattern 3: Single migration that adds junction + drops old column atomically

**What people do:** One Prisma migration that does both in the same SQL file.

**Why it's wrong:** If the data migration (INSERT into `booking_guests`) fails, the column is already gone. Data loss.

**Do this instead:** Migration A creates junction table and backfills data. Migration B (separate, verified run) drops `guest_id` column.

### Anti-Pattern 4: Assuming OpenClaw session history is persistent

**What happens:** Currently `assistant.routes.ts` sends only the current user message. OpenClaw maintains conversation history by session key. If it doesn't (or restarts), the assistant has no context.

**How to detect:** Send "What did I just ask you?" as a follow-up — if the assistant cannot answer, sessions are not server-side in this configuration.

**Mitigation:** Option B (PYR-DB chat turns) makes history reliable regardless of OpenClaw state, and lets the backend inject the full turn history into each request if needed.

---

## Integration Points Summary

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Apple Calendar (CalDAV) | BullMQ job → `caldav.service.ts` → HTTP PUT to iCloud | `ical-builder.ts` must be updated for multi-guest names; payment status will now be real |
| OpenClaw Gateway | HTTP POST streaming SSE proxy via `assistant.routes.ts` | In-memory sessions; session key in `user` field; Option B adds DB persistence layer |
| Claude/OpenAI API | Routed through OpenClaw — no direct calls for chat | AI drafts use direct `services/ai/ai-engine.ts` (unchanged) |

### Internal Module Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `bookings` module ↔ `caldav` service | BullMQ `calendar-sync` queue (existing pattern) | No direct import — follow the existing pattern |
| `bookings` routes ↔ `invoices` service | Direct import in route handler | Acceptable: payments are booking sub-resources within same HTTP request context |
| `assistant` routes ↔ `chat-history` service | Direct import in route handler | Same module directory |
| OpenClaw plugin ↔ PYR backend API | HTTP X-API-Key (existing pattern) | Tool activity bus still fires for streaming indicators — no change needed |

---

## Sources

- `packages/backend/prisma/schema.prisma` — current schema, all models confirmed
- `packages/backend/src/modules/bookings/booking.service.ts` — single guestId pattern confirmed
- `packages/backend/src/modules/bookings/booking.routes.ts` — calendar sync enqueue pattern
- `packages/backend/src/modules/bookings/booking.schema.ts` — current Zod schemas
- `packages/backend/src/services/caldav/caldav.service.ts` — `booking.guest` direct access confirmed
- `packages/backend/src/services/caldav/ical-builder.ts` — `guestName: string` confirmed
- `packages/backend/src/modules/invoices/invoice.service.ts` — confirmed empty stub
- `packages/backend/src/modules/assistant/assistant.routes.ts` — session key as `user` field confirmed
- `packages/backend/src/services/gateway/gateway-ws-client.ts` — WebSocket protocol confirmed
- `packages/backend/src/app.ts` — route registration, plugin order confirmed
- `packages/backend/src/types/entities.ts` — all entity types confirmed
- `packages/backend/ARCHITECTURE.md` — module pattern, audit rules, module communication rules
- `packages/frontend/src/lib/hooks/use-assistant.ts` — fresh key generation on every mount confirmed
- `packages/frontend/src/lib/hooks/use-bookings.ts` — single guest type confirmed
- `packages/frontend/src/components/features/bookings/booking-detail.tsx` — single guest card confirmed
- `packages/assistant/openclaw-plugin/tools/bookings.ts` — single guest interface confirmed
- `openclaw/workspace/TOOLS.md` — 38 tools, tool categories, session management notes
- `openclaw/agents/main/sessions/sessions.json` — empty `{}` confirming no persistence
- `openclaw/openclaw.json` — gateway config, plugin config, HTTP endpoint config

---
*Architecture research for: PYR v1.1 Multi-Guest Bookings, Payments & Chat History*
*Researched: 2026-02-24*
