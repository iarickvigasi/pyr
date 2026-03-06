# Production Environment Reference

This document defines which values belong where in production.

## Environment Files

### `/opt/pyr/.env`

Consumed by the Docker Compose application stack.

Source template:

- `.env.production.example`

### OpenClaw host env file

Consumed by the host-level OpenClaw daemon via a systemd override.

Source template:

- `docs/deployment/examples/openclaw.env.example`

## App Stack Variables (`/opt/pyr/.env`)

### Required

| Variable | Required | Purpose |
|----------|----------|---------|
| `NODE_ENV` | yes | Must be `production` on server |
| `PORT` | yes | Backend listen port inside container |
| `HOST` | yes | Backend listen host |
| `CORS_ORIGIN` | yes | Public dashboard origin |
| `DATABASE_URL` | yes | PostgreSQL connection string using Docker service name `postgres` |
| `REDIS_PASSWORD` | yes | Redis server password used by the container command |
| `REDIS_URL` | yes | Redis connection string using Docker service name `redis` |
| `JWT_SECRET` | yes | JWT signing and encryption root secret |
| `API_KEY` | yes | API key used by the OpenClaw plugin |
| `OPENCLAW_GATEWAY_URL` | yes | HTTP base URL from backend container to host OpenClaw gateway |
| `OPENCLAW_GATEWAY_WS_URL` | yes | WebSocket URL from backend container to host OpenClaw gateway |
| `OPENCLAW_GATEWAY_TOKEN` | yes | Backend auth token for the OpenClaw gateway |
| `OPENCLAW_HOOK_TOKEN` | yes | Shared hook auth token used by OpenClaw hooks |
| `NEXT_PUBLIC_API_URL` | yes | Public API URL baked into the frontend build |

### Optional But Commonly Needed

| Variable | When needed | Notes |
|----------|-------------|-------|
| `EMAIL_USER` / `EMAIL_PASS` | if email must work before UI config | Can later be moved into Settings UI |
| `IMAP_HOST` / `IMAP_PORT` | if using env-based email config | Defaults target GMX |
| `SMTP_HOST` / `SMTP_PORT` | if using env-based email config | Defaults target GMX |
| `EMAIL_POLL_MIN_DATE` | recommended | Use `today` for go-live cutover |
| `CALDAV_URL` / `CALDAV_USER` / `CALDAV_PASS` | if using env-based CalDAV config | Can later be moved into Settings UI |
| `NOTIFY_TELEGRAM_*` | for inbox alert routing | Backend routing config only |
| `MOTOPRESS_*` | if WordPress sync is enabled | Required only when MotoPress sync is in scope |

### Present But Not Used Directly By Backend

| Variable | Notes |
|----------|-------|
| `ANTHROPIC_API_KEY` | OpenClaw uses provider keys; backend does not call providers directly |
| `OPENAI_API_KEY` | OpenClaw uses provider keys; backend does not call providers directly |
| `TELEGRAM_BOT_TOKEN` | OpenClaw uses the bot token; backend only routes notifications by user id |

## OpenClaw Host Variables

These should not live only in `/opt/pyr/.env`. They belong to the host-level OpenClaw service.

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | recommended | Primary model provider |
| `OPENAI_API_KEY` | optional | Fallback provider |
| `OPENCLAW_GATEWAY_TOKEN` | yes | Gateway auth token |
| `OPENCLAW_HOOK_TOKEN` | yes | Hook endpoint token |
| `PYR_API_URL` | yes | Usually `http://127.0.0.1:3001` |
| `PYR_API_KEY` | yes | Same value as backend `API_KEY` |
| `PYR_OPENCLAW_PLUGIN_PATH` | yes | Usually `/opt/pyr/packages/assistant/openclaw-plugin` |
| `PYR_OPENCLAW_WORKSPACE` | yes | Usually `/opt/pyr/openclaw/workspace` |

## Recommended Secret Generation

```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 32   # API_KEY / gateway tokens
```

## Safe Defaults / Recommendations

| Setting | Recommended value |
|---------|-------------------|
| `LOG_LEVEL` | `info` |
| `EMAIL_POLL_MIN_DATE` | `today` |
| `NOTIFY_TELEGRAM_ENABLED` | `true` |
| `NOTIFY_INBOX_SCOPE` | `conversation,ota` |
| `MOTOPRESS_ENABLED` | `false` until credentials and mapping are verified |
| `OPENCLAW_GATEWAY_URL` | `http://host.docker.internal:18789` |
| `OPENCLAW_GATEWAY_WS_URL` | `ws://host.docker.internal:18789` |

## Values That Can Move Into The UI Later

These can be bootstrapped by environment and then managed in the dashboard:

- email provider configuration
- email polling interval / enabled flag
- CalDAV configuration
- Telegram notification routing settings

Keep `JWT_SECRET`, `API_KEY`, and OpenClaw gateway tokens out of the UI. Those remain operator-managed secrets.
