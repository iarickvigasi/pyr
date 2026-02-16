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
| `prisma-helpers.ts` | `notDeleted`, `computeChanges` | Soft-delete filter, change diff for audit |
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
