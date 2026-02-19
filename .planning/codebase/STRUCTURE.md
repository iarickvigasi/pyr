# Codebase Structure

**Analysis Date:** 2026-02-19

## Directory Layout

```
PYR/
├── packages/
│   ├── backend/                    # Fastify REST API
│   │   ├── src/
│   │   │   ├── app.ts             # Fastify app factory, registers routes & plugins
│   │   │   ├── server.ts          # Entry point, starts listener, graceful shutdown
│   │   │   ├── config/
│   │   │   │   └── env.ts         # Zod environment variable schema
│   │   │   ├── lib/               # Shared utilities
│   │   │   │   ├── errors.ts      # AppError subclasses (400, 404, 409, 422, 401)
│   │   │   │   ├── error-handler.ts # Fastify error handler
│   │   │   │   ├── audit.ts       # writeAuditLog(), getActor() helpers
│   │   │   │   ├── pagination.ts  # Cursor-based pagination helpers
│   │   │   │   ├── password.ts    # Hash/verify scrypt passwords
│   │   │   │   ├── prisma-helpers.ts # notDeleted, computeChanges, handleUniqueConstraint
│   │   │   │   └── date-helpers.ts # Timezone utilities
│   │   │   ├── modules/           # Feature modules (one per business domain)
│   │   │   │   ├── auth/          # Login, JWT, current user
│   │   │   │   │   ├── auth.routes.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── auth.schema.ts
│   │   │   │   │   └── auth.test.ts
│   │   │   │   ├── guests/        # Guest CRM, merge, search
│   │   │   │   │   ├── guest.routes.ts
│   │   │   │   │   ├── guest.service.ts
│   │   │   │   │   ├── guest.schema.ts
│   │   │   │   │   └── guest.test.ts
│   │   │   │   ├── rooms/         # Room types, rooms, seasons, availability
│   │   │   │   │   ├── room.routes.ts
│   │   │   │   │   ├── room.service.ts
│   │   │   │   │   ├── room.schema.ts
│   │   │   │   │   └── room.test.ts
│   │   │   │   ├── bookings/      # Booking CRUD, status transitions, cancellation
│   │   │   │   │   ├── booking.routes.ts
│   │   │   │   │   ├── booking.service.ts
│   │   │   │   │   ├── booking.schema.ts
│   │   │   │   │   └── booking.test.ts
│   │   │   │   ├── events/        # Event CRUD, event bookings, capacity
│   │   │   │   │   ├── event.routes.ts
│   │   │   │   │   ├── event.service.ts
│   │   │   │   │   ├── event.schema.ts
│   │   │   │   │   └── event.test.ts
│   │   │   │   ├── inbox/         # Conversations, messages, AI drafts
│   │   │   │   │   ├── inbox.routes.ts
│   │   │   │   │   ├── conversation.service.ts
│   │   │   │   │   ├── message.service.ts
│   │   │   │   │   ├── inbox.schema.ts
│   │   │   │   │   └── inbox.test.ts
│   │   │   │   ├── calendar/      # CalDAV push, event syncing
│   │   │   │   │   └── calendar.routes.ts
│   │   │   │   ├── dashboard/     # KPIs, today's events/check-ins
│   │   │   │   │   ├── dashboard.routes.ts
│   │   │   │   │   ├── dashboard.service.ts
│   │   │   │   │   └── dashboard.test.ts
│   │   │   │   ├── settings/      # Global settings (key-value pairs)
│   │   │   │   │   ├── settings.routes.ts
│   │   │   │   │   ├── settings.service.ts
│   │   │   │   │   └── settings.schema.ts
│   │   │   │   └── invoices/      # Invoice CRUD (Phase 2)
│   │   │   │       ├── invoice.routes.ts
│   │   │   │       └── invoice.service.ts
│   │   │   ├── plugins/           # Fastify plugins (singleton services)
│   │   │   │   ├── prisma.ts      # PrismaClient decoration, lifecycle
│   │   │   │   ├── auth.ts        # JWT + API key authentication
│   │   │   │   ├── redis.ts       # Redis client decoration
│   │   │   │   └── swagger.ts     # Swagger/OpenAPI auto-generation
│   │   │   ├── services/          # Cross-cutting services
│   │   │   │   ├── ai/            # AI engine (Claude + OpenAI)
│   │   │   │   │   ├── ai-engine.ts (placeholder; E6)
│   │   │   │   │   ├── providers/
│   │   │   │   │   │   ├── anthropic.ts (Claude API wrapper)
│   │   │   │   │   │   └── openai.ts (OpenAI fallback)
│   │   │   │   │   ├── draft-generator.ts (AI prompt/response generation)
│   │   │   │   │   └── context-builder.ts (guest data, availability context)
│   │   │   │   ├── email/         # IMAP polling, SMTP sending
│   │   │   │   │   ├── email.service.ts (imap + SMTP client)
│   │   │   │   │   └── email.test.ts
│   │   │   │   ├── caldav/        # Apple Calendar sync (CalDAV push)
│   │   │   │   │   └── caldav.service.ts
│   │   │   │   └── queue/         # Job queue (BullMQ + Redis)
│   │   │   │       ├── queue.ts (queue instance)
│   │   │   │       └── jobs/
│   │   │   │           ├── calendar-sync.job.ts
│   │   │   │           ├── ai-draft.job.ts
│   │   │   │           └── scheduled.job.ts
│   │   │   ├── test/              # Test setup
│   │   │   │   ├── setup.ts       # getTestApp(), cleanDatabase(), getAuthToken()
│   │   │   │   └── factories.ts   # Test data builders (createGuestFactory, etc.)
│   │   │   └── types/             # Internal TypeScript types
│   │   │       ├── entities.ts    # Guest, Booking, Room, Event, etc.
│   │   │       ├── prisma.ts      # PrismaClientOrTx union for tx support
│   │   │       └── fastify.ts (if needed; mostly in plugins)
│   │   ├── prisma/
│   │   │   ├── schema.prisma      # Database schema (models, enums, relations)
│   │   │   └── migrations/        # Prisma migrations (one per schema change)
│   │   ├── package.json           # Backend dependencies
│   │   ├── tsconfig.json          # TypeScript config (strict mode)
│   │   └── vitest.config.ts       # Test runner config
│   ├── frontend/                   # Next.js 15 admin dashboard
│   │   ├── src/
│   │   │   ├── app/               # Next.js App Router
│   │   │   │   ├── layout.tsx     # Root layout (providers, metadata)
│   │   │   │   ├── globals.css    # Tailwind imports, global styles
│   │   │   │   ├── (auth)/        # Route group for login/logout
│   │   │   │   │   └── login/
│   │   │   │   │       └── page.tsx
│   │   │   │   └── (dashboard)/   # Protected dashboard pages
│   │   │   │       ├── layout.tsx (auth guard, sidebar)
│   │   │   │       ├── page.tsx   (KPIs, quick actions)
│   │   │   │       ├── guests/    (list, detail, create, merge)
│   │   │   │       │   ├── page.tsx (list)
│   │   │   │       │   └── [id]/
│   │   │   │       │       └── page.tsx (detail)
│   │   │   │       ├── bookings/  (calendar, list, detail, create)
│   │   │   │       │   ├── page.tsx
│   │   │   │       │   └── [id]/
│   │   │   │       │       └── page.tsx
│   │   │   │       ├── events/    (list, detail, registrations)
│   │   │   │       │   ├── page.tsx
│   │   │   │       │   └── [id]/
│   │   │   │       │       └── page.tsx
│   │   │   │       ├── inbox/     (conversations, messages, drafts)
│   │   │   │       │   ├── page.tsx (list)
│   │   │   │       │   └── [id]/
│   │   │   │       │       └── page.tsx (conversation detail)
│   │   │   │       ├── calendar/  (month & week views)
│   │   │   │       │   └── page.tsx
│   │   │   │       └── settings/  (global app settings)
│   │   │   │           └── page.tsx
│   │   │   ├── components/
│   │   │   │   ├── ui/            # shadcn/ui primitives
│   │   │   │   │   ├── button.tsx, card.tsx, dialog.tsx, form.tsx, ...
│   │   │   │   │   └── (25+ components imported from shadcn/ui)
│   │   │   │   ├── features/      # Feature-specific UI
│   │   │   │   │   ├── guests/
│   │   │   │   │   │   ├── guest-list.tsx
│   │   │   │   │   │   ├── guest-detail.tsx
│   │   │   │   │   │   ├── guest-form.tsx
│   │   │   │   │   │   ├── merge-dialog.tsx
│   │   │   │   │   │   └── __tests__/ (unit tests)
│   │   │   │   │   ├── bookings/
│   │   │   │   │   │   ├── booking-list.tsx
│   │   │   │   │   │   ├── booking-form.tsx
│   │   │   │   │   │   └── booking-detail.tsx
│   │   │   │   │   ├── events/
│   │   │   │   │   ├── inbox/
│   │   │   │   │   ├── calendar/
│   │   │   │   │   │   ├── month-view/
│   │   │   │   │   │   ├── week-view/
│   │   │   │   │   │   └── shared/ (calendaring utils)
│   │   │   │   │   ├── settings/
│   │   │   │   │   └── dashboard/ (KPI cards, quick stats)
│   │   │   │   └── layout/
│   │   │   │       ├── sidebar.tsx (desktop & mobile nav)
│   │   │   │       └── header.tsx (if needed)
│   │   │   ├── lib/
│   │   │   │   ├── api.ts         # ApiClient class, ApiError
│   │   │   │   ├── auth-context.tsx # AuthProvider, useAuth() hook
│   │   │   │   ├── query-client.ts # React Query client factory
│   │   │   │   ├── query-keys.ts  # Query key factory (guests, bookings, etc.)
│   │   │   │   ├── format.ts      # formatCurrency(), formatDate() with TZ
│   │   │   │   ├── date-helpers.ts # Date utilities
│   │   │   │   ├── hooks/         # Custom React hooks
│   │   │   │   │   ├── use-pagination.ts
│   │   │   │   │   ├── use-debounce.ts
│   │   │   │   │   └── __tests__/ (unit tests for hooks)
│   │   │   │   └── __tests__/     # lib-level tests (api.test.ts, format.test.ts)
│   │   │   ├── test/              # Test setup and utilities
│   │   │   │   ├── setup.ts       # Test environment setup
│   │   │   │   └── factories.ts   # Test data builders
│   │   │   ├── types/             # Frontend TypeScript types
│   │   │   │   └── index.ts       # Import from @pyr/shared for most types
│   │   │   ├── providers.tsx      # Root providers (Query, Auth, UI, Toast)
│   │   │   └── middleware.ts (if added later; not in current MVP)
│   │   ├── public/                # Static assets (logo, icons)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── next.config.js
│   │   └── vitest.config.ts       # Frontend unit test config
│   ├── shared/                    # Monorepo shared package
│   │   ├── src/
│   │   │   ├── index.ts           # Main exports
│   │   │   ├── types/             # Shared TypeScript interfaces
│   │   │   │   ├── guest.ts       (Guest, GuestDetail, etc.)
│   │   │   │   ├── booking.ts     (Booking, BookingDetail, etc.)
│   │   │   │   ├── room.ts        (Room, RoomType, Season, etc.)
│   │   │   │   ├── event.ts       (Event, EventBooking, etc.)
│   │   │   │   ├── conversation.ts (Conversation, Message, AiDraft, etc.)
│   │   │   ├── constants/         # Enum arrays, business constants
│   │   │   │   ├── booking-status.ts (BookingStatus[])
│   │   │   │   ├── event-type.ts  (EventType[])
│   │   │   │   ├── channel.ts     (Channel[])
│   │   │   │   └── ... (10+ total)
│   │   │   └── validation/        # Zod schemas
│   │   │       └── index.ts       (shared schemas like idParamSchema)
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── assistant/                 # Telegram/WhatsApp AI bot (Phase 8)
│   │   ├── src/
│   │   │   ├── agent.ts           # NLU + action routing
│   │   │   ├── tools/             # Function-calling tools
│   │   │   ├── connectors/        # Telegram, WhatsApp adapters
│   │   │   ├── scheduler.ts       # Cron jobs (briefings, alerts)
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── booking-widget/            # Embedded booking widget (Phase 2)
│       ├── src/
│       │   ├── index.tsx          # React component
│       │   └── styles.css
│       ├── package.json
│       └── tsconfig.json
├── scripts/                       # Data migration, seeding
│   ├── import-excel.ts            # Excel → DB migration
│   └── seed.ts                    # Development data seed
├── docs/                          # User documentation
│   └── deployment/                # Deployment guides
├── docker/                        # Docker build configs
│   ├── postgres/                  # PostgreSQL init scripts
│   └── caddy/                     # Reverse proxy config
├── docker-compose.yml             # Local dev + production stack
├── package.json                   # Root workspace config
├── turbo.json                     # Turborepo build config
├── CLAUDE.md                      # Project context & conventions
├── PROJECT.md                     # Full project specification
├── EXECUTION_PLAN.md              # MVP execution plan
├── README.md                      # Project overview
└── .planning/                     # Generated documentation
    └── codebase/                  # Architecture analysis (generated)
        ├── ARCHITECTURE.md        (this file)
        ├── STRUCTURE.md
        ├── STACK.md
        ├── INTEGRATIONS.md
        ├── CONVENTIONS.md
        ├── TESTING.md
        └── CONCERNS.md
```

## Directory Purposes

### Backend (`packages/backend/`)

**Module Pattern:**
Each feature lives in `src/modules/<feature>/` with three files:
- `<feature>.routes.ts` — Fastify route handlers with Zod schemas
- `<feature>.service.ts` — Business logic (pure functions)
- `<feature>.schema.ts` — Zod validation schemas for request/response
- `<feature>.test.ts` — Integration tests

**Key Modules:**

| Module | Location | Endpoints | Responsibility |
|--------|----------|-----------|-----------------|
| **auth** | `src/modules/auth/` | POST `/login`, GET `/me` | Login, JWT, current user (rate-limited) |
| **guests** | `src/modules/guests/` | GET/POST/PATCH/DELETE `/guests`, POST `/{id}/merge` | CRM, search, merge, soft-delete |
| **rooms** | `src/modules/rooms/` | GET/POST/PATCH `/room-types`, `/rooms`, `/seasons`, GET `/availability` | Room management, pricing, availability engine |
| **bookings** | `src/modules/bookings/` | GET/POST/PATCH/DELETE `/bookings` | Booking lifecycle, status transitions, overlap detection |
| **events** | `src/modules/events/` | GET/POST/PATCH `/events`, POST `/{id}/book` | Events, registrations, capacity tracking, waitlist |
| **inbox** | `src/modules/inbox/` | GET/POST/PATCH `/conversations`, POST `/{id}/messages`, GET `/{id}/drafts` | Email threading, AI drafts, conversation management |
| **calendar** | `src/modules/calendar/` | POST `/sync` | CalDAV push, sync management |
| **dashboard** | `src/modules/dashboard/` | GET `/stats`, `/today` | KPIs, check-ins/outs, event schedules |
| **settings** | `src/modules/settings/` | GET/POST/PATCH `/settings` | Global key-value configuration |
| **invoices** | `src/modules/invoices/` | GET/POST/PATCH `/invoices` | PayPal invoicing (Phase 2) |

**Library Utilities** (`src/lib/`):
- `errors.ts` — Typed error classes with HTTP status codes
- `error-handler.ts` — Fastify error handler that catches AppError and responds with proper JSON
- `audit.ts` — `writeAuditLog()` and `getActor()` helpers for mutation tracking
- `pagination.ts` — `clampLimit()` for cursor-based pagination
- `password.ts` — scrypt hash/verify helpers
- `prisma-helpers.ts` — `notDeleted` filter, `computeChanges()` diff, `handleUniqueConstraint()` error handling

**Plugins** (`src/plugins/`):
- `prisma.ts` — Decorates `app.prisma` (PrismaClient singleton, lifecycle management)
- `auth.ts` — Adds `app.authenticate` hook, supports JWT + API key
- `redis.ts` — Decorates `app.redis` (Redis client)
- `swagger.ts` — Generates Swagger/OpenAPI docs from Zod schemas

**Services** (`src/services/`):
- `ai/` — AI engine (Claude + OpenAI) with providers and draft generation (E6)
- `email/` — IMAP polling and SMTP sending (E4)
- `caldav/` — Apple Calendar push sync (E7)
- `queue/` — BullMQ job queue with scheduled jobs

### Frontend (`packages/frontend/`)

**Pages** (`src/app/`):
- `(auth)/login/` — Public login form
- `(dashboard)/` — Protected dashboard (redirects to login if not authenticated)
  - `guests/` — Guest CRM list and detail
  - `bookings/` — Booking calendar and detail
  - `events/` — Event management and registrations
  - `inbox/` — Conversations and messages
  - `calendar/` — Calendar views (month and week)
  - `settings/` — Global configuration
  - `page.tsx` — Dashboard home (KPIs, quick stats)

**Components** (`src/components/`):
- `ui/` — shadcn/ui library (25+ components: button, card, dialog, form, table, calendar, select, etc.)
- `features/<feature>/` — Feature-specific composites
  - `guests/` — GuestList, GuestDetail, GuestForm, MergeDialog
  - `bookings/` — BookingList, BookingForm, BookingDetail
  - `events/` — EventList, EventForm, RegistrationList
  - `inbox/` — ConversationList, ConversationDetail, MessageComposer, DraftApprover
  - `calendar/` — MonthView, WeekView
  - `dashboard/` — KPI cards, today's events
  - `settings/` — Settings form
- `layout/` — Sidebar, header, navigation structure

**Libraries** (`src/lib/`):
- `api.ts` — `ApiClient` class with fetch wrapper, error handling, 401 logout
- `auth-context.tsx` — `AuthProvider` + `useAuth()` hook, JWT in localStorage
- `query-client.ts` — React Query client factory
- `query-keys.ts` — Query key factory (ensures consistent cache keys)
- `format.ts` — `formatCurrency()` (EUR cents), `formatDate()` (Nicosia TZ)
- `date-helpers.ts` — Date utilities
- `hooks/` — Custom React hooks (usePagination, useDebounce, etc.)

### Shared (`packages/shared/`)

**Types** (`src/types/`):
- Interfaces: Guest, Booking, Room, Event, Conversation, Message, AiDraft, Invoice, etc.
- Extend types across backend + frontend

**Constants** (`src/constants/`):
- Enum arrays: `BOOKING_STATUSES`, `EVENT_TYPES`, `CHANNELS`, etc.
- Business constants (room capacity, event durations, etc.)

**Validation** (`src/validation/`):
- Zod schemas: `idParamSchema`, basic reusable validators
- Imported by backend routes

## Key File Locations

### Entry Points

**Backend:**
- `packages/backend/src/server.ts` — Node.js entry point, starts listener
- `packages/backend/src/app.ts` — Fastify app factory, all plugin registration

**Frontend:**
- `packages/frontend/src/app/layout.tsx` — Root Next.js layout with providers
- `packages/frontend/src/app/(dashboard)/layout.tsx` — Dashboard auth guard + sidebar

### Configuration

**Backend:**
- `packages/backend/src/config/env.ts` — Zod env var schema
- `packages/backend/prisma/schema.prisma` — Database schema
- `packages/backend/package.json` — Node dependencies, build scripts

**Frontend:**
- `packages/frontend/next.config.js` — Next.js config (ESM, build options)
- `packages/frontend/tailwind.config.ts` — Tailwind CSS config (new-york preset)
- `packages/frontend/package.json` — React + dependencies

### Core Logic

**Guests Module:**
- `packages/backend/src/modules/guests/guest.service.ts` — List, get, create, update, merge, soft-delete
- `packages/frontend/src/components/features/guests/` — List, detail, form, merge dialog

**Bookings Module:**
- `packages/backend/src/modules/bookings/booking.service.ts` — Booking CRUD, availability check, overlap detection
- `packages/frontend/src/components/features/bookings/` — List, detail, form

**Rooms/Availability:**
- `packages/backend/src/modules/rooms/room.service.ts` — Room types, rooms, seasons, per-night pricing
- Frontend uses `availability` endpoint to power booking calendar

### Testing

**Backend:**
- `packages/backend/src/test/setup.ts` — Test app factory, database cleanup, auth token helpers
- `packages/backend/src/test/factories.ts` — Test data builders
- `packages/backend/src/modules/<feature>/<feature>.test.ts` — Module tests

**Frontend:**
- `packages/frontend/src/lib/__tests__/` — API, format, hook tests
- `packages/frontend/src/components/features/<feature>/__tests__/` — Component tests

## Naming Conventions

### Files

| Pattern | Example | Usage |
|---------|---------|-------|
| kebab-case | `guest.routes.ts`, `guest.service.ts` | Module files |
| kebab-case | `create-guest-form.tsx` | React components |
| PascalCase | `GuestList.tsx` | React component names (in code) |
| kebab-case | `__tests__/` | Test directories |
| PascalCase | `GuestDetailWithRelations` | TypeScript types |

### Directories

| Pattern | Example | Purpose |
|---------|---------|---------|
| kebab-case | `src/modules/guests/` | Business feature modules |
| kebab-case | `src/components/features/guests/` | Feature UI components |
| kebab-case | `src/lib/hooks/` | Custom React hooks |
| kebab-case | `src/services/ai/` | Cross-cutting services |
| kebab-case | `__tests__/` | Test suites alongside source |

### Code Identifiers

| Type | Pattern | Example |
|------|---------|---------|
| Variables | camelCase | `guestId`, `totalPrice`, `isLoading` |
| Functions | camelCase | `createGuest()`, `listGuests()`, `formatDate()` |
| Types/Interfaces | PascalCase | `Guest`, `Booking`, `GuestDetailWithRelations` |
| Enums | PascalCase | `BookingStatus`, `EventType`, `Channel` |
| Constants | UPPER_SNAKE_CASE | `API_BASE`, `MAX_GUEST_NAME_LENGTH` |
| React Components | PascalCase | `GuestList`, `BookingForm`, `MergeDialog` |
| Database Columns | snake_case (auto-mapped) | `created_at`, `dietary_needs`, `deleted_at` |
| API Endpoints | kebab-case | `/api/v1/guests`, `/api/v1/room-types`, `/api/v1/conversations` |
| Env Variables | UPPER_SNAKE_CASE | `DATABASE_URL`, `JWT_SECRET`, `TELEGRAM_BOT_TOKEN` |

## Where to Add New Code

### New Feature Module (e.g., "reviews")

1. Create directory: `packages/backend/src/modules/reviews/`
2. Add four files:
   - `reviews.routes.ts` — Define endpoints with Zod schemas
   - `reviews.service.ts` — Business logic (accepts PrismaClient, not Prisma directly)
   - `reviews.schema.ts` — Zod validation schemas
   - `reviews.test.ts` — Integration tests
3. Register in `packages/backend/src/app.ts`:
   ```typescript
   await app.register(reviewRoutes, { prefix: '/api/v1/reviews' });
   ```
4. Frontend: Create `packages/frontend/src/components/features/reviews/` with list, detail, form components
5. Add types to `packages/shared/src/types/review.ts`

### New API Endpoint (within existing module)

1. Add route handler to `<module>.routes.ts`
2. Add service function to `<module>.service.ts`
3. Add Zod schema to `<module>.schema.ts` for validation
4. Wrap writes in `prisma.$transaction()` + `writeAuditLog()`
5. Throw typed errors (BadRequestError, ConflictError, etc.)
6. Add test case to `<module>.test.ts`

### New React Component

1. Create in `packages/frontend/src/components/features/<feature>/` (if feature-specific) or `src/components/ui/` (if reusable)
2. Use shadcn/ui primitives for styling
3. Use React Hook Form + Zod for forms
4. Use React Query hooks for data fetching
5. Add `__tests__/` directory alongside component
6. Type all props and return values

### New Library Function

1. Utilities in `packages/frontend/src/lib/` (e.g., format.ts, date-helpers.ts)
2. Custom hooks in `packages/frontend/src/lib/hooks/`
3. Add test file: `__tests__/<function-name>.test.ts`
4. Export from `packages/frontend/src/lib/index.ts` if shared

### Database Schema Change

1. Update `packages/backend/prisma/schema.prisma`
2. Run: `cd packages/backend && npx prisma migrate dev --name <description>`
3. Migrations auto-apply to dev and test databases
4. Update TypeScript types in `packages/shared/src/types/` if needed

### New External Service Integration

1. Create service file in `packages/backend/src/services/<service-name>/`
2. Define async functions (provider adapters)
3. Model-agnostic pattern (e.g., AI engine supports Claude + OpenAI)
4. Register in plugins or initialize at startup in `app.ts`
5. Use in module services via dependency injection or direct import

## Special Directories

**`.planning/codebase/`** — Generated documentation
- Created by `/gsd:map-codebase` command
- Contains: ARCHITECTURE.md, STRUCTURE.md, STACK.md, INTEGRATIONS.md, CONVENTIONS.md, TESTING.md, CONCERNS.md

**`prisma/migrations/`** — Database schema history
- Auto-generated by `prisma migrate`
- Never hand-edit; always use `prisma migrate dev --name <desc>`
- Committed to git for deterministic deployments

**`.next/`** — Next.js build cache
- Generated: `npm run build`
- Not committed to git
- Can be deleted safely (will be regenerated)

**`dist/` / `build/`** — Compiled JavaScript output
- Generated by `npm run build`
- Not committed to git
- Backend: `tsc` outputs to `dist/`
- Frontend: `next build` outputs to `.next/`

**`.turbo/`** — Turborepo cache
- Generated by `turbo` build system
- Not committed to git
- Can be deleted safely

**`node_modules/`** — Dependencies
- Not committed to git
- Install with: `pnpm install` (at root, installs all packages)

---

*Structure analysis: 2026-02-19*
