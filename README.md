# Puppy Yoga Retreat — Platform

Business automation platform for Puppy Yoga Retreat, Peyia, Cyprus. Replaces manual Excel/copy-paste workflows with a unified CRM, inbox, calendar, AI assistant, and booking system.

## Quick Start (Local Development)

### Prerequisites

- Node.js 22+
- pnpm 9.15+
- Docker + Docker Compose

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start infrastructure (PostgreSQL + Redis)

```bash
docker compose up -d
```

This starts PostgreSQL on `localhost:5432` and Redis on `localhost:6379`. The `pyr_test` database is automatically created for running tests.

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET (32+ chars) and API_KEY (32+ chars)
```

### 4. Run database migrations

```bash
cd packages/backend
pnpm db:migrate
```

### 5. Start the backend

```bash
# From packages/backend/
pnpm dev
# API available at http://localhost:3001
# Swagger UI at http://localhost:3001/documentation
```

### 6. Start the frontend

```bash
# From packages/frontend/
pnpm dev
# Dashboard at http://localhost:3000
```

### 7. Seed development data (optional)

```bash
pnpm --filter @pyr/backend db:seed
```

---

## Running Tests

### Backend (integration tests — requires running DB + Redis)

```bash
# Run all backend tests
pnpm --filter @pyr/backend test

# Watch mode
pnpm --filter @pyr/backend test:watch
```

### Frontend (unit tests — no DB required)

```bash
pnpm --filter @pyr/frontend test

# With coverage
pnpm --filter @pyr/frontend test:coverage
```

### All packages

```bash
pnpm test
```

---

## Project Structure

```
PYR/
├── packages/
│   ├── backend/          # Fastify REST API (Node.js)
│   ├── frontend/         # Next.js 15 admin dashboard
│   ├── assistant/        # Telegram/WhatsApp AI bot (Phase 3)
│   ├── shared/           # Shared types & constants
│   └── booking-widget/   # Public booking widget (Phase 2)
├── docker/               # Docker configs (Postgres init, Caddy)
├── docs/                 # Deployment runbooks, DNS setup
├── scripts/              # DB seed, Excel import
├── docker-compose.yml    # Local dev (Postgres + Redis only)
├── docker-compose.prod.yml  # Production (all services)
├── .env.example          # Environment variable template
├── CLAUDE.md             # AI coding assistant context
├── PROJECT.md            # Full product specification
└── EXECUTION_PLAN.md     # MVP task breakdown (9 epics, 55 tasks)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Fastify 5 + TypeScript strict |
| Database | PostgreSQL 16 + Prisma ORM |
| Cache/Queue | Redis 7 + BullMQ |
| Frontend | Next.js 15 + React 19 + Tailwind v4 + shadcn/ui |
| AI | Anthropic Claude API (primary) + OpenAI (fallback) |
| Auth | JWT (dashboard) + API Key (AI assistant) |
| Testing | Vitest + Supertest |
| Hosting | Hetzner Cloud (EU, GDPR) |

---

## API

- Base URL: `http://localhost:3001/api/v1`
- Auth: `Authorization: Bearer <jwt>` or `X-API-Key: <key>`
- Docs: `http://localhost:3001/documentation` (Swagger UI, dev only)
- Response format: `{ data: T }` success, `{ error: { code, message } }` error

---

## Key Documents

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | Coding conventions, architecture decisions, patterns |
| `PROJECT.md` | Full product spec, all 5 phases, integrations |
| `EXECUTION_PLAN.md` | MVP epics, tasks, dependencies |
| `packages/backend/ARCHITECTURE.md` | Backend request flow, module pattern |
| `packages/backend/TESTING.md` | Test setup, how to write tests |
| `docs/deployment/DEPLOYMENT_RUNBOOK.md` | Production deployment guide |

---

## Development Conventions

- **Branches:** `feat/<epic>-<desc>`, `fix/<desc>`, `chore/<desc>`
- **Commits:** Conventional commits (`feat:`, `fix:`, `chore:`, `test:`)
- **No `any`** — TypeScript strict mode throughout
- **All mutations in DB transactions** — entity write + audit log are atomic
- **Soft deletes** for guests and bookings (`deletedAt` timestamp)
- **Amounts in integer cents** — never floats for money

---

## Phase Status

| Phase | Status | Description |
|-------|--------|-------------|
| E1 Project Setup | ✅ Complete | Monorepo, Docker, CI/CD |
| E2 Database & API | ✅ Complete | Schema, Prisma, all CRUD endpoints |
| E5 Admin Dashboard | ✅ Complete | Next.js dashboard with auth, bookings, events, inbox, settings |
| E3 CRM Enhancements | Pending | Guest timeline, advanced search |
| E4 Email Ingestion | Pending | IMAP polling, email threading |
| E6 AI Engine | Pending | LLM drafts, language detection |
| E7 Calendar Sync | Pending | CalDAV push to Apple Calendar |
| E8 AI Assistant | Pending | Telegram bot, NLU agent |
| E9 Testing & Launch | Pending | Excel migration, UAT, go-live |
