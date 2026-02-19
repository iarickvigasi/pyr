# Backend Architecture

## Request Flow

```
HTTP Request
  → Fastify Server
    → CORS (non-test)
    → Rate Limiting (non-test)
    → Auth Plugin (JWT or API Key)
    → Route Handler
      → Zod Validation (params, query, body)
      → Service Layer (business logic)
        → Prisma (database)
        → Audit Log (on mutations)
    → Error Handler → JSON Response
```

## Plugin Registration Order (app.ts)

1. **Zod type provider** — validator + serializer compilers
2. **Config decorator** — `app.config` access to env vars
3. **Error handler** — AppError, ZodError, Fastify validation errors
4. **CORS** — configured origin from `CORS_ORIGIN`
5. **Rate limiting** — 100 req/min global, 5 req/min on `/auth/login` (disabled in test)
6. **Swagger** — OpenAPI spec at `/docs`
7. **Prisma** — `app.prisma` database client
8. **Redis** — `app.redis` for cache/queues
9. **Auth** — `app.authenticate` hook (JWT + API key)

## Module Pattern

Each feature module lives in `src/modules/<name>/` with:

| File | Purpose |
|------|---------|
| `<name>.routes.ts` | Fastify plugin defining endpoints with Zod schemas |
| `<name>.service.ts` | Business logic functions (receives Prisma client as arg) |
| `<name>.schema.ts` | Zod schemas for request/response validation |
| `<name>.test.ts` | Integration tests using `app.inject()` |

Routes call services. Services call Prisma. Never import Prisma in route files.

## Route Registration

| Module | Prefix | Notes |
|--------|--------|-------|
| auth | `/api/v1/auth` | Login, me |
| guests | `/api/v1/guests` | CRUD + merge |
| rooms | `/api/v1` | Room types at `/room-types`, rooms at `/rooms`, seasons at `/seasons`, availability at `/availability` |
| bookings | `/api/v1/bookings` | CRUD + cancel (DELETE = cancel + soft-delete) |
| events | `/api/v1/events` | CRUD + register + registrations |
| inbox | `/api/v1/conversations` | Conversations, messages, AI drafts |

## Shared Utilities (src/lib/)

| File | Exports | Purpose |
|------|---------|---------|
| `errors.ts` | `AppError`, `NotFoundError`, `ConflictError`, `BadRequestError`, `UnauthorizedError`, `UnprocessableError` | Typed HTTP errors |
| `error-handler.ts` | `errorHandler` | Fastify error handler mapping errors to JSON |
| `audit.ts` | `writeAuditLog` | Writes to `audit_log` table |
| `pagination.ts` | `clampLimit`, `PaginatedResult`, `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE` | Cursor pagination helpers |
| `prisma-helpers.ts` | `notDeleted`, `computeChanges`, `handleUniqueConstraint` | Soft-delete filter, change diff for audit, P2002 → ConflictError |
| `date-helpers.ts` | `TZ`, `utcMidnight`, `nicosiaToday` | Cyprus timezone utilities |
| `password.ts` | `hashPassword`, `verifyPassword` | scrypt password hashing (no native deps) |

## Cursor Pagination Pattern

```typescript
const limit = clampLimit(query.limit); // defaults 20, max 100
const items = await prisma.model.findMany({
  where,
  take: limit + 1,                     // fetch one extra
  ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
  orderBy: { createdAt: 'desc' },
});
const hasMore = items.length > limit;
const data = hasMore ? items.slice(0, limit) : items;
return { data, nextCursor: hasMore ? data.at(-1)!.id : null, hasMore };
```

## Booking Status Machine

```
inquiry ──→ confirmed ──→ checked_in ──→ checked_out
  │              │              │
  └──→ cancelled ←──────────────┘
```

Terminal states: `checked_out`, `cancelled` (no transitions allowed).

## Response Envelope

- Success: `{ data: T }` (single) or `{ data: T[], nextCursor, hasMore }` (list)
- Error: `{ error: { code: string, message: string, details?: unknown } }`

## Authentication

Two modes, checked in order by `app.authenticate`:

1. **API Key** — `X-API-Key` header matching `API_KEY` env var (for AI assistant)
2. **JWT** — `Authorization: Bearer <token>` with payload `{ sub: userId, role: 'admin' }`

Both grant full access (single-user system).

---

## Timezone Handling

Business timezone: **`Europe/Nicosia`** (EET/EEST, UTC+2 in winter, UTC+3 in summer).

- All timestamps stored in the DB as UTC (`timestamptz(3)`).
- Date-only fields (`checkIn`, `checkOut`) are stored as UTC midnight (`2026-04-01T00:00:00.000Z`).
- Use `nicosiaToday()` from `lib/date-helpers.ts` to get the current calendar date in Cyprus. Never use `new Date().toISOString().slice(0, 10)` — that gives UTC date, which differs from Cyprus date during the hours between UTC midnight and Cyprus midnight.
- Use `utcMidnight(dateStr)` from `lib/date-helpers.ts` to convert a `'YYYY-MM-DD'` string to a `Date` for Prisma queries on date fields.

```typescript
import { nicosiaToday, utcMidnight } from '../../lib/date-helpers.js';

const todayStr = nicosiaToday();       // '2026-04-15' (Cyprus local date)
const todayDate = utcMidnight(todayStr); // 2026-04-15T00:00:00.000Z
```

---

## Error Selection Guide

Use the correct error class from `lib/errors.ts` for every service-layer failure:

| Error class           | Status | When to throw |
|-----------------------|--------|---------------|
| `BadRequestError`     | 400    | Invalid input the client should fix (e.g. check-out before check-in, merge guest with self). Also thrown when a booking status transition is rejected by the state machine. |
| `UnauthorizedError`   | 401    | Missing or invalid auth credentials. |
| `NotFoundError`       | 404    | Resource does not exist or has been soft-deleted. |
| `ConflictError`       | 409    | Uniqueness or overlap violation (Prisma P2002, overlapping seasons, double-booking). |
| `UnprocessableError`  | 422    | Syntactically valid request blocked by application state (e.g. approving an already-rejected draft). |

**Never throw a raw `Error`** from service functions — the error handler only maps `AppError` subclasses to structured JSON. Zod validation failures are handled automatically (400) and do not need manual throws.

---

## Audit Log Scope

The following entities write to `audit_log` on every create/update/delete:

| Entity | Logged in |
|--------|-----------|
| guests | `guest.service.ts` |
| bookings | `booking.service.ts` |
| rooms, room types, seasons | `room.service.ts` |
| events, event bookings | `event.service.ts` |
| messages | `inbox.service.ts` |
| settings | `settings.service.ts` |

**Rule:** The audit log write is always inside the same `$transaction` as the entity mutation. This ensures the audit trail cannot be bypassed if the entity write fails, and the audit entry cannot be orphaned if the subsequent code throws.

Bypassing the service layer (writing directly to Prisma in routes) loses the audit trail. Always go through services.
