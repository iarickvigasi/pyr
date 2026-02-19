# Architecture

**Analysis Date:** 2026-02-19

## Pattern Overview

**Overall:** Layered Service-Oriented REST API with Plugin Architecture + Server-Driven React Frontend

**Key Characteristics:**
- **Backend:** Fastify server with modular routes → services → Prisma ORM, organized by business domain
- **Authentication:** Dual-auth (JWT for dashboard, API key for AI assistant)
- **Frontend:** Next.js App Router with server components, React Query for server state, shadcn/ui for components
- **Database-First:** All writes enforce constraints at the database level and in application code
- **Audit-Everything:** All mutations logged atomically in transactions

## Layers

### Backend

**API/Routes Layer:**
- Purpose: Accept HTTP requests, validate with Zod schemas, delegate to services
- Location: `packages/backend/src/modules/<name>/<name>.routes.ts`
- Contains: Fastify route handlers with schema definitions for query, params, body, response
- Depends on: Service layer, Zod validators, Fastify instance
- Used by: HTTP clients (frontend, AI assistant)
- Pattern: Plugin functions that register endpoints with `app.withTypeProvider<ZodTypeProvider>()`; every route wrapped in `server.addHook('onRequest', app.authenticate)`

**Service/Business Logic Layer:**
- Purpose: Enforce business rules, coordinate database operations, compute application state
- Location: `packages/backend/src/modules/<name>/<name>.service.ts`
- Contains: Pure functions accepting PrismaClient or transaction, returning typed data or throwing AppError subclasses
- Depends on: Prisma, shared lib helpers (pagination, errors, audit), entity types
- Used by: Route handlers only (routes never call Prisma directly)
- Pattern: All write operations wrapped in `prisma.$transaction()` where multiple tables affected; mutations logged via `writeAuditLog()` + `getActor()`

**Database/Persistence Layer:**
- Purpose: Type-safe data access and schema management
- Location: `packages/backend/prisma/schema.prisma`, migrations in `packages/backend/prisma/migrations/`
- Contains: Prisma schema with models, enums, relations; generated PrismaClient
- Depends on: PostgreSQL 16
- Used by: Service layer
- Pattern: Soft deletes via `deletedAt: DateTime?` for guests/bookings; hard deletes for ephemeral data; all financial amounts stored as integer cents; cursor-based pagination support via `take`, `skip`, `cursor`

**Infrastructure Plugins:**
- Purpose: Bootstrap services (Prisma, Redis, Auth, Swagger)
- Location: `packages/backend/src/plugins/`
- Files: `prisma.ts`, `redis.ts`, `auth.ts`, `swagger.ts`
- Pattern: Fastify plugins (`fastify-plugin`) decorated onto `FastifyInstance` for singleton lifecycle
- Decorators: `app.prisma`, `app.redis`, `app.authenticate`, Swagger spec

**Shared Services:**
- Purpose: Cross-cutting concerns (AI engine, email polling, CalDAV sync, job queue)
- Location: `packages/backend/src/services/`
- Subdirs: `ai/`, `email/`, `caldav/`, `queue/`
- Pattern: Services initialized at startup, used by modules via dependency injection or direct imports

### Frontend

**Page Layer (Next.js App Router):**
- Purpose: Route structure and layout composition
- Location: `packages/frontend/src/app/`
- Contains: `page.tsx`, `layout.tsx`, route groups `(auth)/`, `(dashboard)/`
- Pattern: App Router with async params (`params: Promise<{ id: string }>`), server components by default, `"use client"` for interactive sections

**Component Layer:**
- Location: `packages/frontend/src/components/`
- Subdirs:
  - `ui/`: shadcn/ui primitives (button, card, dialog, form, calendar, etc.)
  - `features/<feature>/`: Feature-specific composites (e.g., `features/bookings/`, `features/guests/`)
  - `layout/`: Sidebar, header, navigation shared across pages
- Pattern: Feature components compose shadcn primitives; use React Hook Form + Zod for validation

**State Management:**
- **Server State:** React Query (TanStack Query) via `@tanstack/react-query`
  - Query clients in `lib/query-client.ts`
  - Query key factory in `lib/query-keys.ts`
- **Auth State:** `AuthProvider` context (`lib/auth-context.tsx`) storing JWT in localStorage
- **UI State:** React local state or React context for dialogs, filters, etc.

**API Client:**
- Purpose: Type-safe HTTP wrapper for backend API
- Location: `packages/frontend/src/lib/api.ts`
- Pattern: `ApiClient` class with `.get()`, `.post()`, `.patch()`, `.delete()` methods
- Auth: Reads token from localStorage, adds `Authorization: Bearer <token>` to all requests
- Error Handling: 401 clears token and redirects to `/login`; throws `ApiError` with status, code, message

**Utilities:**
- `lib/format.ts`: Formatters (EUR cents → "€1.23", dates with Nicosia TZ)
- `lib/hooks/`: Custom React hooks (e.g., `useDebounce`, `usePagination`)
- `lib/date-helpers.ts`: Date/time utilities (timezone-aware)

### Shared Package

**Purpose:** Types, constants, validation schemas shared across backend and frontend

**Location:** `packages/shared/src/`

**Subdirs:**
- `types/`: TypeScript interfaces (Guest, Booking, Room, Event, Conversation, etc.)
- `constants/`: Enums as arrays (BookingStatus[], EventType[], etc.)
- `validation/`: Zod schemas (exported and used in backend routes)

## Data Flow

### Request → Response (Example: Create Guest)

1. **Frontend:** User fills form → React Hook Form validates with Zod → submits POST to `/api/v1/guests`
2. **API Client:** Wraps request, adds JWT token in Authorization header
3. **Fastify Plugin (Auth):** `app.authenticate` hook verifies JWT or API key, sets `request.user`
4. **Route Handler** (`guest.routes.ts`): Validates body with Zod schema, calls service function
5. **Service** (`guest.service.ts`):
   - Computes changes (before/after diff for audit)
   - Wraps in `prisma.$transaction()`:
     - Insert into `guests` table
     - Write to `audit_log` table with actor + changes
   - Returns typed `Guest` object
6. **Route Handler:** Returns `{ data: guest }` with HTTP 201
7. **Frontend:** React Query updates cache, UI re-renders

### Write Operations (Database Transaction Pattern)

All mutations follow this pattern in service functions:

```typescript
await prisma.$transaction(async (tx) => {
  const entity = await tx.table.create({ data });
  await writeAuditLog(tx, {
    entityType: 'entity',
    entityId: entity.id,
    action: 'create',
    changes: data,
    actor: getActor(userId),
  });
  return entity;
});
```

Ensures atomicity: if audit log fails, entire transaction rolls back.

### Authentication Flow

**Dashboard (JWT):**
1. POST `/api/v1/auth/login` with email + password
2. Backend verifies with scrypt, signs JWT (sub=userId, role=admin, expires 24h)
3. Frontend stores token in `localStorage['pyr_token']`
4. All subsequent requests include `Authorization: Bearer <token>`

**AI Assistant (API Key):**
1. Requests include `X-API-Key: <key>` header
2. Auth plugin sets `request.user = { sub: 'api-key', role: 'assistant' }`
3. Audit logs show `actor: 'api-key'`

### State Management (Booking Example)

1. List page queries `/api/v1/bookings?status=confirmed`
2. React Query caches response under key `['bookings', { status: 'confirmed' }]`
3. User creates new booking via form
4. Service creates in DB, returns `Booking` object, invalidates `['bookings']` cache
5. React Query auto-refetches list, UI updates

## Key Abstractions

### Errors (Typed HTTP Status)

Location: `packages/backend/src/lib/errors.ts`

Classes:
- `BadRequestError` → 400 (client must fix, e.g., invalid dates)
- `NotFoundError` → 404 (resource not found or soft-deleted)
- `ConflictError` → 409 (uniqueness/overlap violated, e.g., double-booking)
- `UnprocessableError` → 422 (valid request blocked by state, e.g., status transition not allowed)
- `UnauthorizedError` → 401 (auth failed)

Error handler in `lib/error-handler.ts` catches these and returns `{ error: { code, message, details? } }`

### Pagination (Cursor-Based)

Location: `packages/backend/src/lib/pagination.ts`

Pattern: Take `limit + 1`, return `{ data, nextCursor, hasMore }`
- Avoids offset issues with large datasets
- Client passes `?cursor=<id>` for next page
- All list endpoints support: `?cursor=`, `?limit=`, `?search=`, `?status=`, `?from=`, `?to=`

### Audit Logging

Location: `packages/backend/src/lib/audit.ts`

All mutations logged to `audit_log` table:
- Entity type, entity ID, action (create/update/delete)
- Changes object: `{ field: { from: old, to: new } }`
- Actor: `admin:<userId>`, `api-key`, or `system`
- Timestamp: server time

### Soft Deletes

Pattern: `deletedAt: DateTime?` column, filter with `{ deletedAt: null }` in queries

Applies to: guests, bookings

Hard deletes: events (ephemeral), messages (handled at API level)

### Module Pattern

Each feature module has:
- `<name>.routes.ts`: Endpoint definitions
- `<name>.service.ts`: Business logic
- `<name>.schema.ts`: Zod validation schemas
- `<name>.test.ts`: Integration tests (if E2 added)

## Entry Points

**Backend Server:**
- Location: `packages/backend/src/server.ts`
- Invokes: `buildApp()` from `app.ts`
- Triggers: Graceful shutdown on SIGTERM/SIGINT
- Health check: `GET /health` verifies DB and Redis

**Backend App:**
- Location: `packages/backend/src/app.ts`
- Registers: Plugins, routes, error handler
- Routes registered at: `/api/v1/auth`, `/api/v1/guests`, `/api/v1/bookings`, `/api/v1/events`, `/api/v1/conversations`, `/api/v1/dashboard`, `/api/v1/settings`, etc.

**Frontend App:**
- Location: `packages/frontend/src/app/layout.tsx`
- Root layout with providers (React Query, Auth, Tooltip, Toast)
- Route groups: `(auth)/login` and `(dashboard)/*`
- Middleware: Auth context checks JWT on app load

**Frontend Dashboard:**
- Location: `packages/frontend/src/app/(dashboard)/layout.tsx`
- Checks `useAuth()` for JWT, redirects to `/login` if missing
- Renders: Sidebar + main content area

## Error Handling

**Backend:**
- All service functions throw typed `AppError` subclasses (not raw `Error`)
- Fastify error handler catches, maps to HTTP status + JSON response
- Zod validation errors automatically caught by `fastify-type-provider-zod` → 400
- Prisma `P2002` (unique constraint) caught in services, thrown as `ConflictError`

**Frontend:**
- API client catches non-2xx responses, throws `ApiError(status, code, message)`
- Components catch `ApiError`, display toast notification
- 401 → clears localStorage, redirects to `/login`

## Logging

**Backend:**
- Framework: pino (structured JSON logging)
- Config:
  - Development: pino-pretty (colorized stdout)
  - Production: structured JSON to stdout (forwarded by containerization)
- Levels: fatal, error, warn, info, debug, trace (configurable via LOG_LEVEL env var)
- Usage: `app.log.info()`, `app.log.error()` in route handlers and services

**Frontend:**
- No structured logging; development relies on browser console
- Production: Errors logged via `toast.error()` for user feedback

## Cross-Cutting Concerns

**Validation:**
- Backend: Zod schemas in `<module>.schema.ts` for routes + shared validation schemas in `packages/shared/`
- Frontend: React Hook Form + Zod resolvers in components

**Pagination:**
- Cursor-based (never offset)
- All list endpoints: `listGuests()`, `listBookings()`, etc. return `{ data, nextCursor, hasMore }`

**Timestamps:**
- All DateTime fields: `timestamptz(3)` in PostgreSQL (millisecond precision, timezone-aware)
- Date-only fields: `date` type (check-in, check-out)
- ISO 8601 format in API (`2026-02-19T10:00:00Z`)

**Financial Amounts:**
- Stored as integer cents (no floating-point errors)
- EUR currency assumed throughout
- Frontend formatters convert to "€1.23" display format

**Concurrency:**
- Optimistic locking not implemented; database constraints prevent conflicts (e.g., room overlaps detected in service logic)
- Transactions used for atomicity where needed (writes + audit log)

---

*Architecture analysis: 2026-02-19*
