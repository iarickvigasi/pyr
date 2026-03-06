# PYR Production Deployment Runbook

This runbook describes the supported production layout for PYR as it exists in this repository today.

## Production Topology

### Docker Compose stack

- `postgres` — PostgreSQL 16
- `redis` — Redis 7 / BullMQ backend
- `backend` — Fastify API on internal port `3001`
- `frontend` — Next.js dashboard on internal port `3000`
- `caddy` — public reverse proxy / TLS termination

### Host-level service

- `OpenClaw Gateway` — runs on the server host, not inside Docker

This split is intentional:

- OpenClaw keeps device auth, pairing state, and channel state on the host.
- Docker Compose keeps the business app stack isolated and reproducible.
- The backend reaches the host OpenClaw gateway through `host.docker.internal:18789`.
- OpenClaw reaches the backend through the loopback-exposed API port `127.0.0.1:3001`.

## Directory Layout On Server

```text
/opt/pyr
├── .env
├── docker-compose.prod.yml
├── packages/
├── openclaw/
│   ├── workspace/
│   └── openclaw.production.example.json
├── secrets/
│   └── db_password.txt
└── docker/
```

## Required Operator Access

- SSH access to the production server
- sudo access
- access to the repository
- access to all production secrets
- access to the email account credentials
- access to the Telegram bot token
- access to the MotoPress credentials if sync is enabled
- access to the Apple Calendar app-specific password if CalDAV is enabled

## 1. Server Bootstrap

Use Ubuntu 24.04 LTS or equivalent.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ca-certificates
curl -fsSL https://get.docker.com | sh
sudo apt install -y docker-compose-plugin
node --version || true
```

Install Node.js 22 on the host for OpenClaw:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

Create a normal deploy user with a home directory. Do not use a system user for OpenClaw.

```bash
sudo adduser pyr
sudo usermod -aG docker pyr
sudo mkdir -p /opt/pyr
sudo chown pyr:pyr /opt/pyr
```

Reconnect as the deploy user:

```bash
ssh pyr@YOUR_SERVER_IP
cd /opt/pyr
```

## 2. Clone The Repository

```bash
git clone <YOUR_GIT_REMOTE> .
git checkout main
```

## 3. Prepare Application Secrets

Create the database password file used by `docker-compose.prod.yml`:

```bash
mkdir -p secrets
openssl rand -base64 32 | tr -d '\n' > secrets/db_password.txt
chmod 600 secrets/db_password.txt
```

Create the app environment file:

```bash
cp .env.production.example .env
chmod 600 .env
```

Edit `.env` and set the real values.

Important:

- the password inside `DATABASE_URL` must match `secrets/db_password.txt`
- `REDIS_PASSWORD` and the password embedded in `REDIS_URL` must match

See the full variable reference in:

- `docs/deployment/ENVIRONMENT_REFERENCE.md`

At minimum, set:

- `DATABASE_URL`
- `REDIS_PASSWORD`
- `REDIS_URL`
- `JWT_SECRET`
- `API_KEY`
- `OPENCLAW_GATEWAY_TOKEN`
- `OPENCLAW_HOOK_TOKEN`
- `NEXT_PUBLIC_API_URL`
- email credentials if email ingestion/sending must be live immediately

## 4. Build And Start The Application Stack

Validate the compose file first:

```bash
docker compose -f docker-compose.prod.yml config >/tmp/pyr-prod-compose.yml
```

Build and start:

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

The backend container now runs migrations during startup before the API process starts.

Check status:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs backend --tail=200
docker compose -f docker-compose.prod.yml logs frontend --tail=100
docker compose -f docker-compose.prod.yml logs caddy --tail=100
```

## 5. Install And Configure OpenClaw On The Host

Follow:

- `docs/deployment/OPENCLAW_SETUP.md`

That document covers:

- installing OpenClaw from official sources
- copying the production config template
- wiring the repo workspace and plugin path
- loading host-level secrets for provider keys and gateway auth
- Telegram pairing / approval
- health checks for the OpenClaw daemon and gateway

## 6. Verify Cross-Service Networking

### Backend -> OpenClaw

The backend should report gateway connectivity:

```bash
curl -s http://127.0.0.1:3001/health
```

Expected once OpenClaw is up:

- `database: ok`
- `redis: ok`
- `gateway: ok`

### OpenClaw -> Backend

From the host shell, verify the backend is reachable on loopback:

```bash
curl -s http://127.0.0.1:3001/health
```

### Public Routes

```bash
curl -I https://app.puppyyogaretreat.com
curl -I https://api.puppyyogaretreat.com/health
```

## 7. First-Time Functional Setup

After the stack is reachable:

1. Log into the dashboard.
2. Confirm the admin user exists.
3. Configure email provider settings in the UI if you do not want to keep mail credentials only in `.env`.
4. Configure CalDAV in Settings if desired.
5. Configure notification settings.
6. If MotoPress is enabled, verify room mappings and credentials.

## 8. Deployment Verification Checklist

Run the checklist in:

- `docs/deployment/PRODUCTION_CHECKLIST.md`

Minimum acceptance:

- dashboard login works
- backend `/health` is green
- assistant dashboard chat streams replies
- Telegram bot responds in direct messages
- inbox polling works if enabled
- SMTP send works from an approved draft
- calendar test connection works if CalDAV is enabled
- MotoPress test fetch works if enabled

## 9. Regular Deployments

```bash
cd /opt/pyr
git fetch origin
git checkout main
git pull --ff-only origin main
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

Then verify:

```bash
docker compose -f docker-compose.prod.yml ps
curl -s http://127.0.0.1:3001/health
```

If OpenClaw config, prompts, tools, or workspace files changed, restart the host daemon too:

```bash
systemctl --user restart openclaw-gateway
openclaw gateway status --deep
```

## 10. Rollback

### Application stack only

```bash
git checkout <PREVIOUS_GOOD_COMMIT>
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

### OpenClaw config rollback

Keep a backup of:

- `~/.openclaw/openclaw.json`
- `~/.config/systemd/user/openclaw-gateway.service.d/override.conf`
- any environment file referenced by the override

Then:

```bash
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway
```

## 11. Important Security Notes

1. OpenClaw runtime state must not live inside this repository.
2. Device keys, pairing tokens, and session state belong under `~/.openclaw` only.
3. This repository previously contained tracked OpenClaw runtime files. They have been removed from the current tree, but if the repository was ever pushed remotely you must rotate the exposed OpenClaw device credentials/tokens.
4. Keep `.env` and any OpenClaw environment files at `0600` permissions.
5. Do not expose PostgreSQL, Redis, or the backend port publicly. The backend is published only on `127.0.0.1:3001` for the host-level OpenClaw daemon.
