---
phase: 10-switch-the-backend-to-use-the-gateway-s-websocket-api
plan: 02
subsystem: api
tags: [websocket, rpc, sse, openai-compatible, notifications, gateway, chat]

# Dependency graph
requires:
  - phase: 10-switch-the-backend-to-use-the-gateway-s-websocket-api
    provides: GatewayWsClient singleton with RPC and chat event routing (plan 01)
provides:
  - WebSocket-backed dashboard chat endpoint with SSE bridge (preserves OpenAI-compatible format)
  - WebSocket-backed notification delivery via agent RPC (replaces HTTP hooks)
  - WebSocket-based AI health check (replaces HTTP POST to /v1/chat/completions)
affects: [10-03, frontend-chat-ui, notification-jobs, ai-health]

# Tech tracking
tech-stack:
  added: []
  patterns: [websocket-to-sse-bridge, chat-event-filtering-by-sessionKey, hook-mapping-replication]

key-files:
  modified:
    - packages/backend/src/modules/assistant/assistant.routes.ts
    - packages/backend/src/modules/notifications/notification.service.ts
    - packages/backend/src/modules/notifications/notification.types.ts
    - packages/backend/src/services/ai/index.ts

key-decisions:
  - "Chat event listener subscribed BEFORE chat.send RPC to avoid missing early deltas"
  - "SSE format preserved exactly as OpenAI-compatible (choices[0].delta.content/tool_calls) for zero frontend changes"
  - "Hook mapping behavior replicated from openclaw.json: briefing/alert deliver=true, draft deliver=false with timestamped sessionKey"
  - "HookPayload type removed since HTTP hook delivery is fully replaced"

patterns-established:
  - "WebSocket-to-SSE bridge: subscribe to chat events, filter by sessionKey, transform to SSE chunks, end on final/error/aborted"
  - "Gateway agent RPC for notifications: replaces HTTP hooks with direct WebSocket RPC calls"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-02-22
---

# Phase 10 Plan 02: Chat SSE & Notification Migration to WebSocket Summary

**Dashboard chat uses WebSocket chat.send with SSE event bridge, notifications use agent RPC, and AI health check uses gateway.isConnected -- all HTTP calls to Gateway removed from these files**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-22T20:41:22Z
- **Completed:** 2026-02-22T20:43:19Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments
- Dashboard chat POST /chat rewritten to use gateway.request('chat.send') with onChatEvent listener bridging to SSE, preserving OpenAI-compatible delta chunk format
- All 5 notification callers (processMorningBriefing, processGuestArrivalAlert, processOverdueInvoiceAlert, sendNewBookingAlert, sendDraftReadyNotification) migrated from sendViaHook to sendViaGateway
- AI health check simplified from HTTP POST to gateway.isConnected boolean check
- Removed unused HookPayload type and HTTP hook delivery function

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate dashboard chat to WebSocket and update notification delivery** - `b5061fc` (feat)

## Files Created/Modified
- `packages/backend/src/modules/assistant/assistant.routes.ts` - WebSocket-backed chat endpoint: chat.send RPC + onChatEvent SSE bridge with OpenAI-compatible format
- `packages/backend/src/modules/notifications/notification.service.ts` - sendViaGateway replaces sendViaHook: agent RPC with deliver/sessionKey mapping from openclaw.json
- `packages/backend/src/modules/notifications/notification.types.ts` - Removed unused HookPayload interface
- `packages/backend/src/services/ai/index.ts` - healthCheck uses gateway.isConnected instead of HTTP POST

## Decisions Made
- Subscribe to chat events BEFORE sending the chat.send RPC to ensure no early delta events are missed (race condition prevention)
- SSE format preserved exactly as `choices[0].delta.content` / `choices[0].delta.tool_calls` so frontend `use-assistant.ts` requires zero changes
- Hook mapping behavior replicated directly from openclaw.json configuration: briefing and alert get `deliver: true`, draft gets `deliver: false` with a timestamped sessionKey
- HookPayload type removed entirely since it was only used by the now-deleted sendViaHook function
- Gateway disconnection returns 502 with `GATEWAY_DISCONNECTED` error code (clear, distinct from the old `OPENCLAW_ERROR`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed unused HookPayload type**
- **Found during:** Task 1 (notification service migration)
- **Issue:** HookPayload type in notification.types.ts was only used by the deleted sendViaHook function
- **Fix:** Removed the interface and its import from notification.service.ts
- **Files modified:** packages/backend/src/modules/notifications/notification.types.ts, packages/backend/src/modules/notifications/notification.service.ts
- **Verification:** `tsc --noEmit` passes (only pre-existing test error remains)
- **Committed in:** b5061fc (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 cleanup)
**Impact on plan:** Minimal -- removed dead code left behind by the HTTP-to-WebSocket migration. No scope creep.

## Issues Encountered
- Pre-existing TypeScript error in `ota-calendar-sync.test.ts` (missing `guestPhone` and `currency` fields on `OtaBookingData`) -- unrelated to this plan, not addressed (out of scope, documented in 10-01-SUMMARY.md)

## User Setup Required
None - no external service configuration required. Uses the same OPENCLAW_GATEWAY_WS_URL configured in plan 10-01.

## Next Phase Readiness
- Dashboard chat and notifications are fully WebSocket-based
- Plan 10-03 can now migrate the remaining HTTP integration point (draft generation) to WebSocket
- Frontend requires zero changes -- SSE format is identical

## Self-Check: PASSED

- All 4 modified files verified on disk
- Commit b5061fc (Task 1) verified in git log
- `tsc --noEmit` passes (only pre-existing test error remains)
- grep confirms no remaining `sendViaHook` in codebase
- grep confirms no remaining `fetch.*v1/chat/completions` in modified files
- grep confirms `gateway.request` used in both assistant.routes.ts and notification.service.ts

---
*Phase: 10-switch-the-backend-to-use-the-gateway-s-websocket-api*
*Completed: 2026-02-22*
