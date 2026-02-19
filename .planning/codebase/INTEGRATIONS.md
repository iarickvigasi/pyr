# External Integrations

**Analysis Date:** 2026-02-19

## APIs & External Services

**AI LLM Providers:**

- **Anthropic Claude API (Primary)** - LLM for AI-generated message drafts, context analysis, NLU
  - SDK: `@anthropic-ai/sdk` 0.39.0
  - Auth: `ANTHROPIC_API_KEY` environment variable
  - Model: Default `claude-sonnet-4-5-20250929` (configurable via `AI_DEFAULT_MODEL`)
  - Usage: Implemented in `packages/backend/src/services/ai/providers/anthropic.ts`
  - Token logging: All calls log token usage and cost

- **OpenAI API (Fallback)** - Fallback LLM provider if Anthropic fails
  - SDK: `openai` 4.78.1
  - Auth: `OPENAI_API_KEY` environment variable
  - Usage: Implemented in `packages/backend/src/services/ai/providers/openai.ts`
  - Architecture: Model-agnostic abstraction layer (`services/ai/ai-engine.ts`)

**Messaging & Notifications:**

- **Telegram Bot API** - AI assistant interface for Ines (MVP), scheduled briefings
  - SDK: `grammy` 1.31.3 (Telegram Bot API wrapper)
  - Auth: `TELEGRAM_BOT_TOKEN` environment variable
  - User restriction: `TELEGRAM_ALLOWED_USER_ID` (Ines only)
  - Connector: `packages/assistant/src/connectors/telegram.ts` (stub for E8 implementation)
  - Status: Planned for E8 (Personal AI Assistant)

- **WhatsApp Cloud API** - Planned for Phase 3, not implemented in MVP
  - Connector: `packages/assistant/src/connectors/whatsapp.ts` (stub)
  - Channel support: Schema includes `whatsapp` enum value in `Channel` type

## Data Storage

**Databases:**

- **PostgreSQL 16** - Primary data store
  - Connection: `DATABASE_URL` environment variable (must start with `postgresql://`)
  - Client: Prisma Client 6.2.1 (`@prisma/client`)
  - ORM: Prisma with type-safe queries
  - Location: `packages/backend/prisma/schema.prisma` contains all entity definitions
  - Migrations: Stored in `packages/backend/prisma/migrations/`
  - Docker image: `postgres:16-alpine` (localhost:5432 for development)

**Cache & Message Queue:**

- **Redis 7** - Session caching, job queue (BullMQ)
  - Connection: `REDIS_URL` environment variable (must start with `redis://`)
  - Client: ioredis 5.4.2
  - Usage: Job queue via BullMQ 5.34.8 for async jobs:
    - `email-poll` queue - IMAP polling scheduled jobs
    - `ai-draft` queue - AI draft generation after incoming messages
    - `calendar-sync` queue - CalDAV push after booking/event mutations
    - `scheduled` queue - Daily briefings and reminders (E8)
  - Configuration: `maxRetriesPerRequest: null` (required for BullMQ), `enableReadyCheck: true`
  - Docker image: `redis:7-alpine` (localhost:6379 for development)
  - Persistence: AOF (Append-Only File) enabled (`redis-server --appendonly yes`)

**File Storage:**

- Not detected - No external file storage service integrated (likely Phase 2+)

## Authentication & Identity

**Auth Provider:**

- Custom implementation using **JWT (JSON Web Tokens)**
  - JWT secret: `JWT_SECRET` environment variable (minimum 32 characters)
  - Library: `@fastify/jwt` 9.0.2
  - Configuration: `packages/backend/src/plugins/auth.ts`
  - Token storage: Frontend stores in localStorage
  - Token transmission: Bearer header (`Authorization: Bearer <token>`) on dashboard requests

**API Key Authentication:**

- Custom implementation for AI assistant
  - API key: `API_KEY` environment variable (minimum 8 characters)
  - Header: `X-API-Key: <key>` on assistant requests
  - Scope: AI assistant requests only (sets role `'assistant'`)

**Multi-factor Authentication:**

- Not detected

## Calendar Integration

**Apple Calendar (CalDAV):**

- Protocol: CalDAV for iCloud calendar sync
- Direction: **One-way push only** (DB → Apple Calendar, never read back)
- Configuration:
  - `CALDAV_URL` - iCloud CalDAV endpoint
  - `CALDAV_USER` - Apple ID email
  - `CALDAV_PASS` - App-specific password (not regular password)
- Implementation: `packages/backend/src/services/caldav/caldav.service.ts` (stub for E7)
- Tracking: `calendar_events` table tracks synced records (`caldav_uid`, `last_synced`)
- Triggered by: `POST /api/v1/calendar/sync` endpoint or `calendar-sync` BullMQ job
- Business rule: Updates sent as VEVENT PUT/DELETE operations

## Email Integration

**GMX Email Provider:**

- **IMAP (Incoming):**
  - Host: `IMAP_HOST` (default `imap.gmx.net`)
  - Port: `IMAP_PORT` (default 993, SSL/TLS)
  - Email: `EMAIL_USER` (e.g., `puppyyogaretreat@gmx.de`)
  - Password: `EMAIL_PASS`
  - Client: imapflow 1.0.171
  - Implementation: `packages/backend/src/services/email/imap.service.ts` (stub for E4)
  - Job: `email-poll` BullMQ job polls on schedule, creates guests, conversations, messages

- **SMTP (Outgoing):**
  - Host: `SMTP_HOST` (default `mail.gmx.net`)
  - Port: `SMTP_PORT` (default 587, STARTTLS)
  - Email/Password: Same as IMAP
  - Client: nodemailer 7.0.11
  - Implementation: `packages/backend/src/services/email/smtp.service.ts` (stub for E4)
  - Usage: Sends manual replies and AI-approved drafts
  - Business rule: Maintains `In-Reply-To` and `References` headers for email threading

## Monitoring & Observability

**Error Tracking:**

- Not detected - Error handling implemented locally but no external error tracking service

**Logs:**

- Structured JSON logging via Pino 9.6.0
- Output: stdout (stdout logged to application output)
- Pretty-printing available in development via `pino-pretty` 13.0.0
- Log level controlled by `LOG_LEVEL` environment variable (default `info`)
- Fields logged: timestamps, request IDs (TBD), error stacks, service-specific context

**Health Checks:**

- Deep health check at `GET /health`
- Verifies:
  - Database connectivity: `SELECT 1` query
  - Redis connectivity: `PING` command
- Returns success/failure status and detailed check results

## Webhooks & Callbacks

**Incoming Webhooks:**

- Not detected in MVP (Phase 4 will add OTA webhook handlers for booking sync)

**Outgoing Webhooks:**

- Not detected in MVP

## External Payment Processing

**PayPal:**

- **Integration planned for Phase 2** (not implemented in MVP)
- Services planned:
  - PayPal Checkout SDK - Customer-facing payment acceptance
  - PayPal Invoicing API v2 - Invoice generation and tracking
- Database schema ready: `invoices` table with `paypal_invoice_id` field, `payments` table with `method` enum supporting `paypal`
- Currency: EUR (€), stored as integer cents to avoid floating-point issues

## OTA Platform Integrations

**Status:** Planned for Phase 4 (not implemented in MVP)

**Supported Channels (schema-ready):**

- GetYourGuide (`gyg`)
- Viator (`viator`)
- BookRetreats (`bookretreats`)
- Tripaneer (`tripaneer`)

**Implementation approach:**

- Channel field present in messages, bookings, and conversations (`Channel` enum)
- Webhook handlers planned for booking sync
- Shared `packages/shared` package provides enums and types

## Environment Configuration

**Required env vars (critical):**

- `DATABASE_URL` - PostgreSQL connection string (must start with `postgresql://`)
- `REDIS_URL` - Redis connection string (must start with `redis://`)
- `JWT_SECRET` - Minimum 32 characters for token signing
- `API_KEY` - Minimum 8 characters for AI assistant authentication

**Optional env vars:**

- `ANTHROPIC_API_KEY` - Claude API key (leave empty for AI draft feature disabled)
- `OPENAI_API_KEY` - OpenAI API key (fallback if Anthropic fails)
- `EMAIL_USER` / `EMAIL_PASS` - GMX credentials (leave empty for inbox feature disabled)
- `IMAP_HOST` / `IMAP_PORT` - Override defaults for custom email provider
- `SMTP_HOST` / `SMTP_PORT` - Override defaults for custom email provider
- `CALDAV_URL` / `CALDAV_USER` / `CALDAV_PASS` - iCloud CalDAV credentials (leave empty for calendar sync disabled)
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ALLOWED_USER_ID` - Telegram credentials (leave empty for assistant disabled)

**Secrets location:**

- Development: `.env` file in project root (loaded via `tsx --env-file` flag)
- Production: Environment variables set in deployment platform (Hetzner)
- Never committed to git (`.gitignore` excludes `.env*`)

---

*Integration audit: 2026-02-19*
