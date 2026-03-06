# Repository Cleanup Program (March 2026)

This document records the cleanup pass applied to improve reliability, reduce duplication, and make ongoing development safer.

## Phase 1: Reliability Baseline

Implemented:

- Assistant contract tests aligned with gateway error/session behavior:
  - `packages/backend/src/modules/assistant/assistant.test.ts`
- Dashboard tests aligned with `guestNames[]` response shape:
  - `packages/backend/src/modules/dashboard/dashboard.test.ts`
- Dashboard service fallback now emits `guestNames[]` from primary guest when junction rows are absent:
  - `packages/backend/src/modules/dashboard/dashboard.service.ts`
- Draft pipeline date helper mock exports `TZ` correctly:
  - `packages/backend/src/services/ai/__tests__/draft-pipeline.test.ts`

## Phase 2: Service Decomposition + Dedup

### Inbox split

Conversation monolith split into focused services:

- `packages/backend/src/modules/inbox/conversation-read.service.ts`
- `packages/backend/src/modules/inbox/conversation-draft.service.ts`
- `packages/backend/src/modules/inbox/conversation-customer.service.ts`
- `packages/backend/src/modules/inbox/conversation-booking.service.ts`
- `packages/backend/src/modules/inbox/conversation.service.ts` (barrel exports)

### Rooms split

Room service monolith split into focused services:

- `packages/backend/src/modules/rooms/room-core.service.ts`
- `packages/backend/src/modules/rooms/room-external-mapping.service.ts`
- `packages/backend/src/modules/rooms/motopress-import.service.ts`
- `packages/backend/src/modules/rooms/room-season.service.ts`
- `packages/backend/src/modules/rooms/room.service.ts` (barrel exports)

### Shared OpenClaw stream helper

Added one canonical helper for agent stream collection + JSON extraction:

- `packages/backend/src/services/gateway/agent-stream.ts`

Used by:

- `openclaw-classifier.ts`
- `openclaw-booking-analyzer.ts`
- `openclaw-viator-event-analyzer.ts`

### Shared calendar sync enqueue helper

Added one enqueue helper for booking/event/inbox event mutations:

- `packages/backend/src/services/caldav/calendar-sync-queue.ts`

Adopted by:

- `packages/backend/src/modules/bookings/booking.routes.ts`
- `packages/backend/src/modules/events/event.routes.ts`
- `packages/backend/src/modules/inbox/inbox.routes.ts`

## Phase 3: Contract Centralization

Added shared inbox schemas/types:

- `packages/shared/src/validation/inbox.ts`
- exported via `packages/shared/src/validation/index.ts`

Backend now consumes shared inbox contracts:

- `packages/backend/src/modules/inbox/inbox.schema.ts`

Frontend hooks now consume shared DTO types:

- `packages/frontend/src/lib/hooks/use-conversations.ts`

Nullability drift fix:

- `packages/shared/src/types/message.ts` now uses `guestId: string | null` in `Conversation`.

## Phase 4: Assistant/Docs/Workspace Hygiene

Canonical assistant naming updated to **Ailu**:

- `openclaw/workspace/SOUL.md`
- `packages/backend/src/modules/assistant/assistant.routes.ts` (fallback prompt)
- `packages/assistant/ARCHITECTURE.md`

Assistant architecture docs updated to current tool surface:

- tool count updated to `43`
- tool breakdown updated to include conversation booking tools and payments

Inbox OpenClaw docs updated for strict OpenClaw-first classifier semantics:

- `docs/inbox-openclaw-rework.md`
- removed stale deterministic-rules fallback wording
- classifier error behavior now documented as safe `other` + `openclaw_error`

Workspace noise reduction:

- `pnpm-workspace.yaml` now includes active packages only:
  - `packages/backend`
  - `packages/frontend`
  - `packages/shared`
  - `packages/assistant/openclaw-plugin`

Legacy placeholder packages remain in-repo but are excluded from active workspace execution.

## Phase 5: Tooling Guardrails

Real lint scripts enabled:

- `packages/backend/package.json`
- `packages/frontend/package.json`
- `packages/shared/package.json`

Lint dependencies and baseline rules enabled:

- root `package.json` devDependencies includes ESLint + TS/React plugins
- root `.eslintrc.json` includes:
  - `@typescript-eslint/consistent-type-assertions`
  - `no-empty` (no empty catches)

Generated artifact hygiene:

- stopped tracking `*.tsbuildinfo` artifacts in git index

CI gate update:

- `.github/workflows/ci.yml` now includes an explicit required backend-test step before full workspace tests.

## Added/Extended Tests

Shared OpenClaw stream helper tests:

- `packages/backend/src/services/gateway/__tests__/agent-stream.test.ts`

Plugin draft/action reliability tests:

- `packages/assistant/openclaw-plugin/__tests__/inbox-telegram-tools.test.ts`
  - approve failure path asserts `No changes were applied.`
  - regenerate flow endpoint coverage
  - reject flow endpoint coverage
