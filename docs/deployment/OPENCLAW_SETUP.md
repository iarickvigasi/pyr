# OpenClaw Production Setup

This guide covers the host-level OpenClaw gateway used by PYR in production.

## Source Of Truth

Use the official OpenClaw project for install and health commands.

Primary references:

- https://github.com/openclaw/openclaw
- https://docs.openclaw.ai/

Commands confirmed from the official project README include:

- `openclaw onboard --install-daemon`
- `openclaw doctor`
- `openclaw gateway status`
- `openclaw gateway status --deep`
- `openclaw pairing approve <channel> <code>`

## Why OpenClaw Runs On The Host

PYR keeps OpenClaw outside Docker because it maintains:

- device identity
- channel pairing state
- gateway/runtime state
- operator-local auth material

That state belongs in `~/.openclaw`, not inside `/opt/pyr` and not in Git.

## 1. Install OpenClaw

As the `pyr` deploy user:

```bash
npm install -g openclaw@latest
openclaw --version
```

Bootstrap the daemon and default home directory:

```bash
openclaw onboard --install-daemon
openclaw doctor
```

## 2. Install The PYR OpenClaw Config

Copy the safe production template from the repository into the real OpenClaw home:

```bash
cp /opt/pyr/openclaw/openclaw.production.example.json ~/.openclaw/openclaw.json
```

This config points OpenClaw at:

- the repo workspace under `/opt/pyr/openclaw/workspace`
- the plugin under `/opt/pyr/packages/assistant/openclaw-plugin`
- the backend API on `http://127.0.0.1:3001`

## 3. Provide Environment To The OpenClaw Daemon

Create a host-level env file from the example:

```bash
mkdir -p ~/.config/pyr
cp /opt/pyr/docs/deployment/examples/openclaw.env.example ~/.config/pyr/openclaw.env
chmod 600 ~/.config/pyr/openclaw.env
```

Edit `~/.config/pyr/openclaw.env` and set real values.

Then add a user service override:

```bash
mkdir -p ~/.config/systemd/user/openclaw-gateway.service.d
cat > ~/.config/systemd/user/openclaw-gateway.service.d/override.conf <<'UNIT'
[Service]
EnvironmentFile=%h/.config/pyr/openclaw.env
UNIT
```

Reload and restart:

```bash
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway
```

## 4. Health Checks

```bash
openclaw doctor
openclaw gateway status
openclaw gateway status --deep
```

Expected:

- daemon is active
- gateway is listening
- plugin loads successfully
- model provider auth is valid

## 5. Verify PYR Plugin Wiring

OpenClaw must be able to reach the backend locally:

```bash
curl -s http://127.0.0.1:3001/health
```

The plugin path should resolve to:

- `/opt/pyr/packages/assistant/openclaw-plugin`

The workspace path should resolve to:

- `/opt/pyr/openclaw/workspace`

## 6. Telegram Setup

### Inputs needed

- Telegram bot token
- allowed owner Telegram user id(s)
- owner DM user id for notification delivery

The backend routes notifications using:

- `NOTIFY_TELEGRAM_ENABLED`
- `NOTIFY_TELEGRAM_OWNER_USER_ID`
- `NOTIFY_INBOX_SCOPE`

OpenClaw itself needs the bot token and channel auth in its host environment/runtime.

### Pairing / approval

If Telegram asks for a pairing code, approve it using the official command:

```bash
openclaw pairing approve telegram <PAIRING_CODE>
```

After approval:

1. send a DM to the bot
2. confirm Ailu replies
3. confirm the backend health endpoint reports `gateway: ok`
4. confirm an inbox notification reaches the owner DM

## 7. Operational Rules

1. Never copy `~/.openclaw/identity`, `devices`, or other runtime state into the repository.
2. Back up `~/.openclaw/openclaw.json` and your service override after every config change.
3. Restart OpenClaw whenever you change:
   - gateway tokens
   - model provider keys
   - plugin code
   - workspace prompt files
   - channel credentials

## 8. Troubleshooting

### `gateway: disconnected` in backend health

- check `systemctl --user status openclaw-gateway`
- run `openclaw gateway status --deep`
- verify `OPENCLAW_GATEWAY_TOKEN` matches between backend `.env` and OpenClaw host env
- verify backend can resolve `host.docker.internal`

### Plugin cannot call backend

- verify `PYR_API_URL=http://127.0.0.1:3001`
- verify the backend port is published on loopback in `docker-compose.prod.yml`
- test with `curl -s http://127.0.0.1:3001/health`

### Telegram works locally but not on the server

- verify the bot token is present in the OpenClaw host env
- verify the owner user id is allowed
- re-run pairing approval if a new code is issued
- inspect OpenClaw daemon logs

### OpenClaw config drift

The deployable config in this repo is the template:

- `/opt/pyr/openclaw/openclaw.production.example.json`

The live config is:

- `~/.openclaw/openclaw.json`

Keep the live file under versioned operator control outside Git.
