# Inbox + OpenClaw Rework (MVP v2)

## Scope

This document defines the new minimal/robust inbox pipeline:

- Keep existing IMAP/SMTP connectivity.
- Rebuild classification + customer-link workflow + AI draft trigger behavior.
- Use OpenClaw as primary classifier runtime with deterministic fallback.
- Remove automatic guest creation from inbound email processing.
- Stop OTA auto-booking side effects in inbox ingestion.

## OpenClaw Control Surface in This Project

### Runtime and transport

- OpenClaw workspace config: `openclaw/openclaw.json`
- Backend gateway client: `packages/backend/src/services/gateway/gateway-ws-client.ts`
- Backend gateway plugin: `packages/backend/src/plugins/gateway.ts`
- Draft generation already uses `gateway.request('agent', ...)` with `deliver: false`.

### Workspace memory/knowledge files

- Persona/system prompt: `openclaw/workspace/SOUL.md`
- Agent operating rules: `openclaw/workspace/AGENTS.md`
- Long-term memory: `openclaw/workspace/MEMORY.md`
- Skills knowledge: `openclaw/workspace/skills/**/SKILL.md`

### Tooling integration

- OpenClaw plugin entry: `packages/assistant/openclaw-plugin/index.ts`
- Tool set: `packages/assistant/openclaw-plugin/tools/*.ts`
- Backend API bridge: `packages/assistant/openclaw-plugin/lib/api-client.ts`

The plugin executes backend API calls with `X-API-Key`, so OpenClaw can safely read/update business entities through typed tools.

## Session Strategy (Classification vs Drafting)

### Decision

Use **agent RPC with isolated per-task session keys**, not long-lived shared sessions.

### Why

- Classification must be deterministic and side-effect free.
- Isolation prevents context bleed between unrelated emails.
- It supports safe concurrency across many inbound messages.

### Implemented approach

- Classifier call: `gateway.request('agent', ...)` with session key:
  - `email-classify:<conversation-or-new>:<timestamp>`
- Draft call (existing behavior): unique `draft:<conversationId>:<timestamp>`
- Both use `deliver: false`.

## New Inbound Email Flow

Implemented in `packages/backend/src/services/email/index.ts`:

1. Poll IMAP and parse MIME.
2. Deduplicate by `Message-ID`.
3. Resolve thread candidate via RFC headers (`In-Reply-To`, `References`).
4. Classify with OpenClaw (`openclaw-classifier.ts`), fallback to rules (`email-classifier.ts`).
5. Match existing guest only (no create):
   - Conversation email: match sender email.
   - OTA email: match OTA-extracted email/name.
6. Upsert conversation:
   - keep/update classification
   - update `lastMessageAt`
   - mark unread
   - set `guestId` only if existing match found
7. Store message + attachments.
8. Enqueue AI draft only for conversation-classified emails.
9. Never auto-create guest, never auto-create OTA booking.

## Classification Taxonomy

Canonical values are defined in:

- `packages/backend/src/services/email/inbox-classification.ts`

Primary classes:

- `conversation`
- `ota_tripaneer`
- `ota_bookyogaretreats`
- `ota_other`
- `other`

Legacy values are still accepted for backward compatibility:

- `guest_inquiry`, `ota_notification`, `spam_newsletter`, `admin_system`

## Inbox UI and API Changes

### API

Updated/added in `packages/backend/src/modules/inbox`:

- List supports tab bucket filter:
  - `bucket=conversation_ota`
  - `bucket=other`
- New endpoints:
  - `GET /api/v1/conversations/:id/customer-suggestion`
  - `POST /api/v1/conversations/:id/link-guest`
  - `POST /api/v1/conversations/:id/create-guest`

### Frontend

Updated in `packages/frontend/src/components/features/inbox` and hooks:

- Two tabs in inbox list:
  - Conversations/OTA
  - Other
- Customer suggestion card in conversation view:
  - Link existing guest
  - Create and link guest from email data
- Classification badge/options updated to new taxonomy.
- Draft approval flow:
  - Clicking `Approve` on a draft now pastes draft text into the reply composer.
  - Email is sent only when the composer `Send` action is confirmed.
  - Prevents accidental immediate send and ensures final human review in one place.
- Conversation header links:
  - Linked customer name opens `/guests/:id`.
  - Linked booking badges open `/bookings/:id`.

## OTA Parsing And Booking Suggestion Status

Current production behavior:

1. OTA parsing is active for inbox ingestion and customer suggestion:
   - Parser entrypoint: `packages/backend/src/services/email/ota-parsers/index.ts`
   - Ingestion usage: `packages/backend/src/services/email/index.ts`
   - Customer suggestion usage: `packages/backend/src/modules/inbox/conversation.service.ts`
2. Inbox does not auto-create bookings from email ingestion.
3. Inbox currently does not expose a dedicated "create booking suggestion" endpoint/UI card.

This is deliberate in the current MVP to avoid unsafe auto-booking side effects from partial OTA emails.

## OpenClaw Classifier Contract

Implemented in `packages/backend/src/services/email/openclaw-classifier.ts`:

- Sends structured email/thread payload.
- Uses strict JSON output contract.
- Validates response with Zod.
- Normalizes legacy category outputs.
- Falls back to deterministic rules if gateway is unavailable or output is invalid.

## Verification Performed

Executed checks:

- `pnpm --filter @pyr/backend type-check`
- `pnpm --filter @pyr/frontend type-check`
- `pnpm --filter @pyr/backend test -- src/services/email/__tests__/email-classifier.test.ts src/services/email/__tests__/contact-matcher.test.ts src/services/email/__tests__/pipeline.integration.test.ts`
- `pnpm --filter @pyr/backend test -- src/services/email/__tests__/ota-calendar-sync.test.ts`
- `pnpm --filter @pyr/backend test -- src/modules/inbox/inbox.test.ts src/modules/inbox/__tests__/draft-workflow.test.ts`

Additional focused checks:

- Approve/send behavior:
  - `Approve` updates composer content and defers send until `Send`.
  - No immediate SMTP call on approve click alone.
- OTA booking side effects remain disabled:
  - `ota-calendar-sync.test.ts` verifies no auto guest/booking creation from OTA ingestion.

Full backend suite status at verification time:

- `pnpm --filter @pyr/backend test` currently fails in unrelated modules (`assistant`, `dashboard`) with 6 failing tests total.

## External OpenClaw references

- OpenClaw docs (official): https://docs.openclaw.ai/
- Configuration reference: https://docs.openclaw.ai/configuration/openclaw-json
- Webhooks/hooks docs: https://docs.openclaw.ai/automation/webhooks
- Plugin SDK docs: https://docs.openclaw.ai/plugins/quickstart
- OpenClaw repo: https://github.com/deepfates/openclaw
