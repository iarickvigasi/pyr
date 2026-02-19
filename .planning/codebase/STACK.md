# Technology Stack

**Analysis Date:** 2026-02-19

## Languages

**Primary:**
- TypeScript 5.7.3 - Strict mode enabled across all packages (backend, frontend, assistant, shared)

**Secondary:**
- None detected

## Runtime

**Environment:**
- Node.js 22+ (specified in `engines` field in root `package.json`)

**Package Manager:**
- pnpm 9.15.4 (enforced via `packageManager` field)
- Lockfile: pnpm-lock.yaml (present)

## Frameworks

**Core:**
- Fastify 5.2.1 - REST API backend (`packages/backend`)
- Next.js 15.1.6 - Admin dashboard React app (`packages/frontend`)
- React 19.0.0 - UI component library for frontend
- Prisma 6.2.1 - ORM and database schema management

**Testing:**
- Vitest 3.0.4 - Test runner for all packages (backend, frontend, assistant)
- Supertest 7.0.0 - HTTP assertion library for API testing (backend only)
- @testing-library/react 16.2.0 - Component testing utilities (frontend)
- @testing-library/jest-dom 6.6.3 - DOM matchers for React components

**Build/Dev:**
- Turbo 2.3.3 - Monorepo build orchestration
- tsx 4.19.2 - TypeScript execution for scripts
- tsc - TypeScript compiler for type checking
- Prettier 3.4.2 - Code formatting

## Key Dependencies

**Critical:**

- `@prisma/client` 6.2.1 - Database ORM client, type-safe queries
- `ioredis` 5.4.2 - Redis client, required for BullMQ and session caching
- `bullmq` 5.34.8 - Job queue backed by Redis (email polling, AI drafts, calendar sync, scheduled tasks)
- `zod` 3.24.1 - Runtime schema validation (API requests, environment variables)
- `fastify-type-provider-zod` 4.0.2 - Zod type provider for Fastify routes

**AI Engine:**

- `@anthropic-ai/sdk` 0.39.0 - Anthropic Claude API client (primary LLM provider)
- `openai` 4.78.1 - OpenAI API client (fallback LLM provider)

**Email & Communication:**

- `imapflow` 1.0.171 - IMAP client for email polling (GMX integration)
- `nodemailer` 7.0.11 - SMTP client for sending email replies
- `grammy` 1.31.3 - Telegram Bot API framework (assistant package)

**Frontend UI:**

- `next-themes` 0.4.6 - Dark mode theme management
- `@tanstack/react-query` 5.64.1 - Server state management and caching
- `react-hook-form` 7.71.1 - Form state management
- `@hookform/resolvers` 3.10.0 - Zod integration for React Hook Form
- `tailwindcss` 4.0.6 - Utility-first CSS framework
- `@tailwindcss/postcss` 4.0.6 - Tailwind CSS PostCSS plugin
- `class-variance-authority` 0.7.1 - Component variant composition
- `clsx` 2.1.1 - Conditional className concatenation
- `tailwind-merge` 3.0.1 - Merge Tailwind CSS classes intelligently
- `cmdk` 1.1.1 - Command/search palette component
- `sonner` 2.0.7 - Toast notification library
- `date-fns` 4.1.0 - Date utility library (with Europe/Nicosia timezone support)
- `react-day-picker` 9.13.2 - Calendar component
- `lucide-react` 0.474.0 - Icon library
- `radix-ui` 1.4.3 - Headless UI components (@radix-ui packages installed separately)

**Backend Infrastructure:**

- `@fastify/cors` 10.0.2 - CORS middleware
- `@fastify/helmet` 12.0.1 - Security headers
- `@fastify/rate-limit` 10.2.1 - Rate limiting (disabled in test environment)
- `@fastify/jwt` 9.0.2 - JWT authentication
- `@fastify/swagger` 9.4.2 - OpenAPI/Swagger schema generation
- `@fastify/swagger-ui` 5.2.1 - Swagger UI documentation frontend
- `fastify-plugin` 5.0.1 - Fastify plugin utility

**Logging & Monitoring:**

- `pino` 9.6.0 - Structured JSON logging (backend and assistant)
- `pino-pretty` 13.0.0 - Pretty-print Pino logs (dev only)

**Utilities:**

- `node-cron` 3.0.3 - Cron job scheduling (assistant package)

**Shared Package:**

- `@pyr/shared` - Workspace package containing shared TypeScript types, enums, and validation schemas

## Configuration

**Environment:**

- Environment variables loaded via Zod schema validation in `packages/backend/src/config/env.ts`
- Zod schema enforces:
  - `DATABASE_URL` must start with `postgresql://`
  - `REDIS_URL` must start with `redis://`
  - `JWT_SECRET` minimum 32 characters
  - `API_KEY` minimum 8 characters
  - Optional fields: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CALDAV_*`, `TELEGRAM_BOT_TOKEN`
  - Default values for IMAP/SMTP hosts (GMX configuration)

**Build:**

- **Backend build:** TypeScript compilation → `dist/` directory. Prisma migrations included via `copyfiles` utility.
- **Frontend build:** Next.js standalone output (`output: 'standalone'` in `next.config.ts`). Transpiles `@pyr/shared` package.
- **Assistant build:** TypeScript compilation → `dist/` directory.

**Development:**

- Backend: `tsx watch --env-file ../../.env` (watches `src/`, loads root `.env`)
- Frontend: `next dev` (port 3000)
- Assistant: `tsx watch`
- Root: `turbo dev` orchestrates all package dev scripts in parallel

**Testing:**

- Backend: Vitest with Node.js environment, single fork pool, 15s timeout. Test DB: `pyr_test`
- Frontend: Vitest with jsdom environment, globals enabled, v8 coverage provider
- Both use setupFiles approach for test configuration

## Platform Requirements

**Development:**

- Node.js 22+
- pnpm 9.15.4
- PostgreSQL 16 (for `docker compose up`)
- Redis 7 (for `docker compose up`)
- Docker and Docker Compose (for local infrastructure)

**Production:**

- **Hosting:** Hetzner Cloud (EU) for GDPR compliance
- **Deployment:** Docker Compose with PostgreSQL 16, Redis 7, and containerized services
- **Container Registry:** Not specified (likely uses Docker build locally)

## CI/CD & Deployment

**CI Platform:**

- GitHub Actions (workflows in `.github/workflows/`)

**Deployment:**

- Docker Compose orchestration (see `docker-compose.yml`)
- PostgreSQL 16-alpine container with health checks
- Redis 7-alpine container with AOF persistence
- Services defined for backend and frontend (not shown in compose file, likely added post-Docker setup)

---

*Stack analysis: 2026-02-19*
