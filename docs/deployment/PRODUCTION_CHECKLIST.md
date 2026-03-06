# Production Verification Checklist

Run this after first deployment and after every significant update.

## Infrastructure

- [ ] `docker compose -f docker-compose.prod.yml ps` shows all containers healthy/running
- [ ] `curl -s http://127.0.0.1:3001/health` returns `database: ok`
- [ ] `curl -s http://127.0.0.1:3001/health` returns `redis: ok`
- [ ] `curl -s http://127.0.0.1:3001/health` returns `gateway: ok`
- [ ] `openclaw doctor` passes
- [ ] `openclaw gateway status --deep` passes

## Public Endpoints

- [ ] `https://app.puppyyogaretreat.com` loads over HTTPS
- [ ] `https://api.puppyyogaretreat.com/health` responds over HTTPS
- [ ] dashboard login works

## Assistant / OpenClaw

- [ ] assistant page streams a reply from Ailu
- [ ] Telegram DM to the bot gets a reply
- [ ] Telegram notifications arrive for `conversation` / `OTA` emails if enabled
- [ ] OpenClaw plugin can read bookings / guests / inbox data

## Email

- [ ] SMTP send succeeds from an approved draft
- [ ] polling works if enabled
- [ ] new inbound email creates or updates a conversation
- [ ] latest inbound `conversation` email can generate a draft

## Calendar / Integrations

- [ ] CalDAV test connection succeeds if CalDAV is enabled
- [ ] new booking syncs to calendar if CalDAV is enabled
- [ ] MotoPress room fetch/import works if MotoPress is enabled
- [ ] manual MotoPress sync works if enabled

## Inbox / Business Flows

- [ ] inbox tabs load (`Conv`, `OTA`, `Other`)
- [ ] booking analysis works from inbox
- [ ] event analysis works from inbox for Viator messages
- [ ] event registration removal works from assistant and UI

## Security / Ops

- [ ] `.env` permissions are `0600`
- [ ] OpenClaw host env permissions are `0600`
- [ ] OpenClaw runtime state is outside the repo
- [ ] backups are configured and tested
