# CLAUDE.md — Puppy Yoga Retreat Platform

## Project Overview

Business automation platform for **Puppy Yoga Retreat** (Peyia, Paphos, Cyprus) — a wellness retreat combining yoga, meditation, and rescued puppy interaction, run by Ines Brendel.

**Goal:** Replace manual Excel spreadsheets and copy-paste workflows across 8+ platforms with a centralized CRM/PMS, unified communication hub, AI-powered message drafting, personal AI assistant, and online booking system.

**Strategy:** MVP-first. Phase 1 delivers the core system (CRM, email, calendar, AI assistant, dashboard). Later phases add website booking (P2), social channels (P3), OTA integrations (P4), and accounting (P5).

### Key Documents

- `PROJECT.md` — Full project specification: business context, architecture, all platform integration details, tech stack, all 5 phases, risks
- `EXECUTION_PLAN.md` — MVP execution plan: 9 epics, 55 tasks, dependencies, timeline, definition of done

**Always reference these documents when making architectural or scope decisions.**

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Language** | TypeScript (strict) | Used across backend, frontend, and shared packages |
| **Backend** | Node.js + Fastify | REST API, all business logic |
| **Database** | PostgreSQL 16 | Primary data store — guests, bookings, rooms, events, messages, invoices |
| **Cache/Queue** | Redis 7 + BullMQ | Session cache, job queue (email polling, calendar sync, scheduled tasks) |
| **ORM/Migrations** | Prisma | Schema management, migrations, type-safe queries |
| **Frontend** | React + Next.js (App Router) | Admin dashboard, booking widget |
| **UI** | Tailwind CSS + shadcn/ui | Component library, consistent design system |
| **AI Engine** | Anthropic Claude API (primary), OpenAI (fallback) | Model-agnostic abstraction layer |
| **Email** | IMAP (node-imap) + SMTP (nodemailer) | GMX integration: imap.gmx.net:993, mail.gmx.net:587 |
| **Calendar** | CalDAV (Apple Calendar) | One-way push from DB to iCloud |
| **Payments** | PayPal Checkout SDK + Invoicing API v2 | Phase 2 — EUR, SEPA bank transfer support |
| **Messaging** | Telegram Bot API (MVP), WhatsApp Cloud API (later) | AI assistant interface for Ines |
| **Auth** | JWT (dashboard), API key (AI assistant) | Single admin user (Ines) |
| **Testing** | Vitest + Supertest | Unit tests, integration tests, API endpoint tests |
| **Logging** | pino | Structured JSON logging |
| **Hosting** | Hetzner Cloud (EU) | GDPR-compliant, Docker Compose deployment |
| **CI/CD** | GitHub Actions | Lint, test, build, deploy on merge to main |
| **Containerization** | Docker + Docker Compose | PostgreSQL, Redis, backend, frontend |

---

## Project Structure (Monorepo)

```
PYR/
├── CLAUDE.md                  # This file — project context for Claude
├── PROJECT.md                 # Full project specification
├── EXECUTION_PLAN.md          # MVP execution plan (epics & tasks)
├── docker-compose.yml         # Local dev + production containers
├── .github/
│   └── workflows/             # CI/CD pipelines
├── packages/
│   ├── backend/               # Fastify REST API
│   │   ├── src/
│   │   │   ├── modules/       # Feature modules (guests, bookings, rooms, events, messages, calendar, ai)
│   │   │   │   └── <module>/
│   │   │   │       ├── <module>.routes.ts
│   │   │   │       ├── <module>.service.ts
│   │   │   │       ├── <module>.schema.ts    # Zod validation schemas
│   │   │   │       └── <module>.test.ts
│   │   │   ├── services/      # Shared services (email, caldav, ai-engine, queue)
│   │   │   ├── plugins/       # Fastify plugins (auth, cors, rate-limit)
│   │   │   ├── lib/           # Shared utilities (errors, pagination, audit)
│   │   │   └── app.ts         # Fastify app setup
│   │   ├── prisma/
│   │   │   ├── schema.prisma  # Database schema
│   │   │   └── migrations/    # Prisma migrations
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── frontend/              # Next.js admin dashboard
│   │   ├── src/
│   │   │   ├── app/           # Next.js App Router pages
│   │   │   ├── components/    # React components
│   │   │   │   ├── ui/        # shadcn/ui primitives
│   │   │   │   └── features/  # Feature-specific components
│   │   │   ├── lib/           # API client, utilities, hooks
│   │   │   └── types/         # Shared TypeScript types
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── assistant/             # Personal AI assistant (Telegram/WhatsApp bot)
│   │   ├── src/
│   │   │   ├── agent.ts       # Core NLU + action routing
│   │   │   ├── tools/         # Function-calling tool definitions (maps to REST API)
│   │   │   ├── connectors/    # Messaging platform connectors (telegram, whatsapp)
│   │   │   ├── scheduler.ts   # Cron jobs (briefings, alerts)
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared/                # Shared types, constants, validation schemas
│       ├── src/
│       │   ├── types/         # TypeScript interfaces shared across packages
│       │   ├── constants/     # Business constants (event types, booking statuses, etc.)
│       │   └── validation/    # Shared Zod schemas
│       ├── package.json
│       └── tsconfig.json
├── scripts/                   # Data migration, seed, utilities
│   ├── import-excel.ts        # Excel → DB migration script
│   └── seed.ts                # Development seed data
├── docs/                      # Additional documentation
├── package.json               # Root package.json (workspaces)
└── turbo.json                 # Turborepo config (if using)
```

---

## Coding Conventions

### General
- **TypeScript strict mode** everywhere — no `any` types unless truly unavoidable (annotate with `// eslint-disable-next-line` and comment why)
- **ESM modules** (`"type": "module"` in package.json)
- **Explicit return types** on all exported functions
- **Zod** for all runtime validation (API request/response schemas, env vars)
- **No classes** for business logic — prefer plain functions and modules
- **Errors:** Throw typed error objects with HTTP status codes; Fastify error handler maps them to responses

### Backend (Fastify)
- **Module pattern:** Each feature is a Fastify plugin registered under `modules/<name>/`
- **Route files** define endpoints with Zod schemas for params, query, body, and response
- **Service files** contain all business logic — routes call services, services call Prisma
- **Never import Prisma directly in route files** — always go through the service layer
- **All database writes wrapped in transactions** where multiple tables are affected
- **Pagination:** cursor-based for list endpoints; return `{ data, nextCursor, hasMore }`
- **Soft deletes** for guests and bookings (use `deletedAt` timestamp); hard delete only for truly ephemeral data
- **Audit logging:** Write to `audit_log` table for all create/update/delete operations on core entities

### Frontend (Next.js)
- **App Router** with server components by default; `"use client"` only when needed
- **shadcn/ui** components in `components/ui/` — do not modify these directly
- **Feature components** in `components/features/` — compose shadcn primitives
- **API calls** through a typed client in `lib/api.ts` using `fetch` — no axios
- **State:** React Query (TanStack Query) for server state; React context for UI state
- **Forms:** React Hook Form + Zod resolvers
- **i18n:** Support EN and DE — use a simple key-value approach (no heavy framework for MVP)

### AI Engine
- **Model-agnostic:** Abstract LLM calls behind a common interface (`services/ai-engine/`)
- **System prompts** stored as templates with variable injection (guest data, availability, etc.)
- **Token counting** and cost logging on every AI call
- **All AI-generated content is a draft** — never auto-send without human approval
- **Temperature:** Use low temperature (0.3–0.5) for factual responses, medium (0.6–0.7) for creative replies

### Naming
- **Files:** kebab-case (`guest.service.ts`, `booking-status.ts`)
- **Variables/functions:** camelCase
- **Types/interfaces:** PascalCase, no `I` prefix
- **Database columns:** snake_case (Prisma maps to camelCase in TS)
- **API endpoints:** `/api/v1/<resource>` — RESTful, plural nouns (`/guests`, `/bookings`, `/events`)
- **Environment variables:** UPPER_SNAKE_CASE, prefixed by context (`DB_HOST`, `IMAP_HOST`, `AI_API_KEY`)

---

## Database Schema — Key Entities

These are the core tables. Full schema lives in `packages/backend/prisma/schema.prisma`.

| Entity | Key Fields | Notes |
|--------|-----------|-------|
| **guests** | id, name, email, phone, language (en/de), dietary_needs, source, tags, notes | Central CRM record |
| **rooms** | id, room_type_id, name, status | Physical rooms at the villa |
| **room_types** | id, name, description, base_price, max_occupancy | Room categories with pricing |
| **seasons** | id, name, start_date, end_date, price_multiplier | Seasonal pricing adjustments |
| **bookings** | id, guest_id, room_id, check_in, check_out, status, total_price, source | Retreat stays |
| **events** | id, type, title, date, time, capacity, location, description | Standalone events (yoga, beach walk, etc.) |
| **event_bookings** | id, event_id, guest_id, status | Event registrations with capacity tracking |
| **conversations** | id, guest_id, channel, subject, status | Threaded message groups per guest |
| **messages** | id, conversation_id, direction (in/out), content, channel, sent_at | Individual messages |
| **ai_drafts** | id, message_id, content, status (pending/approved/edited/rejected), model, tokens_used | AI-generated reply drafts |
| **calendar_events** | id, booking_id or event_id, caldav_uid, last_synced | Apple Calendar sync tracking |
| **invoices** | id, booking_id, guest_id, amount, status, paypal_invoice_id | PayPal invoice tracking |
| **payments** | id, invoice_id, amount, method, received_at | Payment records |
| **audit_log** | id, entity_type, entity_id, action, changes, actor, timestamp | All mutations logged |

### Booking Statuses
`inquiry` → `confirmed` → `checked_in` → `checked_out` (or `cancelled` from any state)

### Event Types
- `puppy_yoga` — Rooftop yoga with puppies (90 min, capacity ~8)
- `beach_walk` — Puppy beach walk
- `coffee_cake_cuddles` — Social event with puppies
- `retreat` — Multi-day retreat (handled via bookings, not event_bookings)

---

## API Design

- **Base URL:** `/api/v1/`
- **Auth:** `Authorization: Bearer <jwt>` for dashboard; `X-API-Key: <key>` for assistant
- **Response format:** `{ data: T }` for success, `{ error: { code, message, details? } }` for errors
- **HTTP status codes:** 200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 404 Not Found, 409 Conflict, 422 Unprocessable Entity, 500 Internal Server Error
- **List endpoints:** Support `?cursor=`, `?limit=`, `?search=`, `?status=`, `?from=`, `?to=`
- **Date format:** ISO 8601 (`2026-03-15T10:00:00Z`) in API; stored as `timestamptz` in PostgreSQL

### Core Endpoints (MVP)

```
# Guests
GET    /api/v1/guests          — List/search guests
GET    /api/v1/guests/:id      — Guest detail with history
POST   /api/v1/guests          — Create guest
PATCH  /api/v1/guests/:id      — Update guest
POST   /api/v1/guests/merge    — Merge duplicate guests

# Bookings
GET    /api/v1/bookings        — List bookings (filterable)
GET    /api/v1/bookings/:id    — Booking detail
POST   /api/v1/bookings        — Create booking (checks availability)
PATCH  /api/v1/bookings/:id    — Update booking
DELETE /api/v1/bookings/:id    — Cancel booking

# Rooms
GET    /api/v1/rooms           — List rooms with status
GET    /api/v1/room-types      — List room types with pricing
GET    /api/v1/availability    — Check room availability for date range

# Events
GET    /api/v1/events          — List events
POST   /api/v1/events          — Create event
PATCH  /api/v1/events/:id      — Update event
POST   /api/v1/events/:id/book — Register guest for event
GET    /api/v1/events/:id/registrations — List registrations

# Conversations & Messages
GET    /api/v1/conversations              — List conversations (inbox)
GET    /api/v1/conversations/:id          — Conversation with messages
GET    /api/v1/conversations/:id/drafts   — AI drafts for conversation
POST   /api/v1/conversations/:id/approve  — Approve & send AI draft
POST   /api/v1/conversations/:id/reply    — Send manual reply

# Calendar
POST   /api/v1/calendar/sync   — Trigger manual calendar sync

# Dashboard
GET    /api/v1/dashboard/stats  — KPIs (bookings count, revenue, pending inquiries)
GET    /api/v1/dashboard/today  — Today's check-ins, check-outs, events
```

---

## Key Business Rules

These rules MUST be enforced in code:

1. **No double-booking rooms.** The availability engine must prevent overlapping confirmed bookings for the same room.
2. **Event capacity enforcement.** Never exceed max capacity. Support waitlist when full.
3. **AI drafts always require human approval.** Never auto-send a message without Ines confirming.
4. **Write operations from AI assistant require confirmation.** The assistant shows a summary and Ines must explicitly approve.
5. **Apple Calendar is read-only mirror.** Data flows one-way: DB → Apple Calendar. Never read from calendar to update DB.
6. **All financial amounts in EUR (€).** Store as integer cents in the database to avoid floating-point issues.
7. **Guest language detection matters.** Respond in the guest's language (EN or DE). Detect from incoming messages or guest profile.
8. **Soft delete guests and bookings.** Never hard-delete — set `deleted_at` timestamp.
9. **Audit everything.** All create/update/delete operations on core entities go to `audit_log`.
10. **Email threading.** Always maintain `In-Reply-To` and `References` headers for proper threading in guest email clients.

---

## Brand Voice (for AI system prompts)

The AI engine must generate messages matching this tone:

- **Warm and welcoming** — personal, not corporate
- **Mindful and calming** — reflects the yoga/wellness brand
- **Animal-welfare focused** — all puppies are rescues; emphasize this naturally
- **Informative but concise** — answer questions clearly without over-explaining
- **Bilingual** — English and German with equal quality
- **Sign off as Ines** — the AI writes as Ines, not as a bot

---

## Environment Variables

Required env vars (defined in `.env`, loaded via Zod validation at startup):

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/pyr
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=<random-64-char>
API_KEY=<for-ai-assistant>

# Email (GMX)
IMAP_HOST=imap.gmx.net
IMAP_PORT=993
SMTP_HOST=mail.gmx.net
SMTP_PORT=587
EMAIL_USER=puppyyogaretreat@gmx.de
EMAIL_PASS=<password>

# AI
ANTHROPIC_API_KEY=<key>
OPENAI_API_KEY=<key>            # Fallback
AI_DEFAULT_MODEL=claude-sonnet-4-5-20250929

# Apple Calendar (CalDAV)
CALDAV_URL=<icloud-caldav-endpoint>
CALDAV_USER=<apple-id>
CALDAV_PASS=<app-specific-password>

# Telegram (AI Assistant)
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_ALLOWED_USER_ID=<ines-telegram-id>

# App
NODE_ENV=development|production
PORT=3001
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
```

---

## Development Workflow

1. **Branch naming:** `feat/<epic>-<short-desc>`, `fix/<desc>`, `chore/<desc>` (e.g., `feat/e2-guest-api`, `fix/email-threading`)
2. **Commits:** Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`)
3. **PRs:** Each task (e.g., E2-T5) is one or more PRs. Reference task ID in PR title.
4. **Testing:** Write tests alongside code. Run `vitest` before committing. CI runs full test suite.
5. **Database changes:** Always create a Prisma migration (`npx prisma migrate dev --name <desc>`). Never modify the DB manually.
6. **Local dev:** `docker compose up` starts PostgreSQL + Redis. Backend and frontend run with `npm run dev`.

---

## Current Phase: Phase 1 — MVP

We are building the MVP as defined in `EXECUTION_PLAN.md`. The 9 epics are:

| Epic | Status | Description |
|------|--------|-------------|
| **E1** Project Setup & Infrastructure | Not started | Monorepo, Docker, Hetzner, CI/CD, SSL |
| **E2** Database Design & Backend API | Not started | Schema, Prisma, all CRUD endpoints |
| **E3** CRM & Guest Management | Not started | Guest profiles, search, merge, timeline |
| **E4** Email Ingestion & Unified Inbox | Not started | IMAP polling, threading, inbox UI, OTA email parsing |
| **E5** Admin Dashboard | Not started | Next.js app, pages for bookings/events/calendar/settings |
| **E6** AI Communication Engine | Not started | System prompts, LLM integration, language detection, FAQ |
| **E7** Calendar & Apple Calendar Sync | Not started | CalDAV push, availability engine |
| **E8** Personal AI Assistant | Not started | Telegram bot, NLU agent, query/action capabilities, briefings |
| **E9** Testing, Migration & Launch | Not started | Tests, Excel import, UAT, go-live |

**Refer to `EXECUTION_PLAN.md` for full task details, dependencies, and estimates per task.**

---

## Important Context

- **Single user system (MVP).** Ines is the only admin user. No multi-tenancy needed.
- **GDPR applies.** EU hosting (Hetzner), proper consent handling, data stored in EU.
- **The villa is in Peyia (8560), Paphos, Cyprus.** Timezone: `Europe/Nicosia` (EET/EEST, UTC+2/+3).
- **Retreats are 4-day and 7-day packages.** Includes accommodation, yoga, vegetarian meals, puppy interaction.
- **Standalone events:** Puppy Yoga Classes (90 min, rooftop), Puppy Beach Walks, Coffee/Cake/Cuddles.
- **OTA platforms** (GetYourGuide, Viator, BookRetreats, Tripaneer) are Phase 4 — don't build for them in MVP, but design the schema to accommodate them.
- **WhatsApp/Instagram** are Phase 3 — the unified inbox should have a `channel` field ready for them.
- **PayPal invoicing** is Phase 2 — schema includes invoice/payment tables but implementation is later.
