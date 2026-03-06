# Puppy Yoga Retreat — Platform

Business automation platform for Puppy Yoga Retreat, Peyia, Cyprus. It combines CRM, bookings, events, inbox, calendar sync, and an OpenClaw-powered assistant.

## Local Development

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker + Docker Compose
- OpenClaw installed locally if you want the assistant/gateway flows

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start PostgreSQL and Redis

```bash
docker compose up -d
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- `JWT_SECRET`
- `API_KEY`

If you want the assistant locally, also set:

- `OPENCLAW_GATEWAY_TOKEN`
- `OPENCLAW_HOOK_TOKEN`

### 4. Run the backend

```bash
pnpm --filter @pyr/backend dev
```

Backend:

- API: `http://localhost:3001`
- Swagger: `http://localhost:3001/documentation`

### 5. Run the frontend

```bash
pnpm --filter @pyr/frontend dev
```

Frontend:

- Dashboard: `http://localhost:3000`

### 6. Run OpenClaw locally

The repo includes a local OpenClaw config under `openclaw/openclaw.json` and a committed workspace under `openclaw/workspace/`.

```bash
cd openclaw
openclaw start
```

Gateway:

- HTTP / WS: `http://localhost:18789`

## Production Deployment

Production setup is documented here:

- `docs/deployment/DEPLOYMENT_RUNBOOK.md`
- `docs/deployment/OPENCLAW_SETUP.md`
- `docs/deployment/ENVIRONMENT_REFERENCE.md`
- `docs/deployment/PRODUCTION_CHECKLIST.md`
- `.env.production.example`

## Useful Commands

```bash
pnpm lint
pnpm type-check
pnpm test
```

## Stack

| Layer | Technology |
|-------|------------|
| Backend | Fastify + TypeScript + Prisma |
| Frontend | Next.js 15 + React 19 |
| Database | PostgreSQL 16 |
| Queue / Cache | Redis 7 + BullMQ |
| Assistant runtime | OpenClaw |
| Calendar sync | CalDAV / iCloud |
| OTA sync | MotoPress + Viator flows |

## Notes

1. OpenClaw runtime state must stay outside Git.
2. The current production pattern is Docker for the app stack plus a host-level OpenClaw daemon.
3. The legacy `packages/assistant` package is not part of the active production runtime. The active assistant integration lives in `packages/assistant/openclaw-plugin`.
