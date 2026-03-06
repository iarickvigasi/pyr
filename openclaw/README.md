# OpenClaw In This Repo

This directory contains committed OpenClaw workspace files and deployable
configuration templates for PYR.

## What Is Committed

- `workspace/` — Ailu prompt files, skills, and business-facing instructions.
- `openclaw.production.example.json` — safe production config template.
- `openclaw.json` — current local developer config.

## What Must Never Be Committed

OpenClaw runtime state belongs in the operator's OpenClaw home directory
(normally `~/.openclaw`), not in this repository:

- device identities / private keys
- paired-device allowlists
- live session transcripts
- gateway logs
- canvas state
- update-check state

Those paths are already ignored in `.gitignore`. If they ever appear in git
history, rotate the affected device tokens/keys immediately.

## Production Pattern

For production, keep the OpenClaw daemon on the host and point it at this repo:

1. Copy `openclaw.production.example.json`
   to `~/.openclaw/openclaw.json`.
2. Set:
   - `PYR_OPENCLAW_WORKSPACE=/opt/pyr/openclaw/workspace`
   - `PYR_OPENCLAW_PLUGIN_PATH=/opt/pyr/packages/assistant/openclaw-plugin`
   - `PYR_API_URL=http://127.0.0.1:3001`
3. Keep device auth and channel credentials in `~/.openclaw`, not under `/opt/pyr`.

Full server setup is documented in:

- `docs/deployment/DEPLOYMENT_RUNBOOK.md`
- `docs/deployment/OPENCLAW_SETUP.md`
