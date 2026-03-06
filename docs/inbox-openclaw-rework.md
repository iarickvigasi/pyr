# Inbox + OpenClaw Rework (MVP v2)

Related: `docs/telegram-inbox-ops-runbook.md`

## Scope

This document defines the new minimal/robust inbox pipeline:

- Keep existing IMAP/SMTP connectivity.
- Rebuild classification + customer-link workflow + AI draft trigger behavior.
- Use OpenClaw-only classifier/analyzer runtime; on failure, persist safe `other` with source `openclaw_error`.
- Remove automatic guest creation from inbound email processing.
- Stop OTA auto-booking side effects in inbox ingestion.
- Add manual booking analysis + booking wizard flow from Inbox conversation view.

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
4. Classify with OpenClaw (`openclaw-classifier.ts`) using strict JSON validation.
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
  - `POST /api/v1/conversations/:id/booking-analysis`
  - `POST /api/v1/conversations/:id/bookings`

### Frontend

Updated in `packages/frontend/src/components/features/inbox` and hooks:

- Three tabs in inbox list:
  - Conv
  - OTA
  - Other
- Customer suggestion card in conversation view:
  - Link existing guest
  - Create and link guest from email data
- Classification badge/options updated to new taxonomy.
- Draft approval flow:
  - Clicking `Approve` on a draft now pastes draft text into the reply composer.
  - Email is sent only when the composer `Send` action is confirmed.
  - Prevents accidental immediate send and ensures final human review in one place.
- Draft generation UX (new robust flow):
  - `Generate AI Draft` and rejected/failed `Generate new draft` now use explicit status phases:
    - `submitting` -> `queued` -> `waiting` -> `ready` (or `error`)
  - Regeneration from rejected/failed cards calls `POST /api/v1/conversations/:id/drafts/:draftId/regenerate`.
  - Manual generation button calls `POST /api/v1/conversations/:id/drafts/generate`.
  - Manual generation is allowed only when the latest thread message is inbound.
  - UI keeps a persistent status card with loader and queue/wait messaging until a new draft appears (or timeout/error).
  - While generation is in flight, actions are disabled to prevent duplicate requests.
- AI draft output format (MVP-safe):
  - System prompt explicitly requires plain-text email output (no Markdown syntax).
  - System prompt now always injects current Cyprus date (`Europe/Nicosia`) and recent conversation history context.
  - Backend normalizes AI output by stripping Markdown-like syntax before storing drafts.
  - Approve/send path also normalizes content before SMTP send as a final safety guard.
- Conversation header links:
  - Linked customer name opens `/guests/:id`.
  - Linked booking badges open `/bookings/:id`.
- Manual booking analysis + wizard:
  - `BookingAnalysisCard` is shown in Inbox detail view for conversation/OTA threads.
  - States: idle, loading, ready, insufficient data, not applicable, error.
  - Analysis is user-triggered only (`Analyze for booking`), never automatic.
  - Booking extraction uses OpenClaw only (no deterministic fallback extractor).
  - `Create booking` opens `InboxBookingWizardDialog` with editable prefilled values.
  - Guest flow supports:
    - linked guest,
    - existing guest selection,
    - guest creation inside wizard.
  - Booking creation links `booking.sourceConversationId` and links conversation guest if needed.
  - Successful create refreshes conversation + booking queries and booking links appear in header.

## OTA Parsing And Booking Suggestion Status

Current production behavior:

1. OTA parsing is active for inbox ingestion and customer suggestion:
   - Parser entrypoint: `packages/backend/src/services/email/ota-parsers/index.ts`
   - Ingestion usage: `packages/backend/src/services/email/index.ts`
   - Customer suggestion usage: `packages/backend/src/modules/inbox/conversation-customer.service.ts`
2. Inbox does not auto-create bookings from email ingestion.
3. Inbox exposes manual booking analysis and booking creation in conversation detail:
   - analyze: `POST /api/v1/conversations/:id/booking-analysis`
   - create: `POST /api/v1/conversations/:id/bookings`
4. Duplicate-booking prevention beyond existing overlap validation is intentionally out of scope.

This is deliberate in the current MVP to avoid unsafe auto-booking side effects from partial OTA emails while still enabling controlled manual booking creation.

## OpenClaw Classifier Contract

Implemented in `packages/backend/src/services/email/openclaw-classifier.ts`:

- Sends structured email/thread payload.
- Uses strict JSON output contract.
- Validates response with Zod.
- Normalizes legacy category outputs.
- If gateway is unavailable or output is invalid, returns safe `other` with `source=openclaw_error`.

## OpenClaw Booking Analyzer Contract

Implemented in `packages/backend/src/services/email/openclaw-booking-analyzer.ts`:

- Calls gateway `agent` with isolated session key:
  - `booking-analyze:<conversationId>:<timestamp>`
- Uses `deliver: false`.
- Sends conversation classification + subject + latest inbound + recent thread context.
- Requires strict JSON contract validated by Zod.
- Returns normalized result states:
  - `ready`
  - `insufficient_data`
  - `not_applicable`
  - `error`
- No deterministic fallback extractor is used for booking analysis.

## Verification Performed

Executed checks:

- `pnpm --filter @pyr/backend type-check`
- `pnpm --filter @pyr/frontend type-check`
- `pnpm --filter @pyr/backend test -- src/services/email/__tests__/email-classifier.test.ts src/services/email/__tests__/contact-matcher.test.ts src/services/email/__tests__/pipeline.integration.test.ts`
- `pnpm --filter @pyr/backend test -- src/services/email/__tests__/ota-calendar-sync.test.ts`
- `pnpm --filter @pyr/backend test -- src/modules/inbox/inbox.test.ts src/modules/inbox/__tests__/draft-workflow.test.ts`
- `pnpm --filter @pyr/backend test -- src/modules/inbox/inbox.test.ts -t "Booking analysis workflow|Create booking from conversation workflow"`
- `pnpm --filter @pyr/frontend test -- src/components/features/inbox/__tests__`

Additional focused checks:

- Approve/send behavior:
  - `Approve` updates composer content and defers send until `Send`.
  - No immediate SMTP call on approve click alone.
- OTA booking side effects remain disabled:
  - `ota-calendar-sync.test.ts` verifies no auto guest/booking creation from OTA ingestion.

Full backend suite status:

- Full `pnpm --filter @pyr/backend test` was not re-run in this pass; focused inbox/email checks above were used for this feature.

## External OpenClaw references

- OpenClaw docs (official): https://docs.openclaw.ai/
- Configuration reference: https://docs.openclaw.ai/configuration/openclaw-json
- Webhooks/hooks docs: https://docs.openclaw.ai/automation/webhooks
- Plugin SDK docs: https://docs.openclaw.ai/plugins/quickstart
- OpenClaw repo: https://github.com/deepfates/openclaw
