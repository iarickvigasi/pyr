---
phase: 10-switch-the-backend-to-use-the-gateway-s-websocket-api
plan: 01
subsystem: infra
tags: [websocket, ws, openclaw, gateway, rpc, fastify-plugin]

# Dependency graph
requires:
  - phase: 07-openclaw-assistant-core
    provides: OpenClaw Gateway HTTP integration (OPENCLAW_GATEWAY_TOKEN, OPENCLAW_GATEWAY_URL)
provides:
  - GatewayWsClient class with persistent WebSocket connection, RPC, chat event routing
  - Fastify gateway plugin decorating app.gateway
  - WebSocket protocol types for OpenClaw Gateway v3
  - OPENCLAW_GATEWAY_WS_URL env var
affects: [10-02, 10-03, assistant-routes, draft-generator, notification-service]

# Tech tracking
tech-stack:
  added: [ws 8.x, "@types/ws"]
  patterns: [persistent-websocket-singleton, rpc-over-websocket, exponential-backoff-reconnect, event-emitter-chat-routing]

key-files:
  created:
    - packages/backend/src/services/gateway/types.ts
    - packages/backend/src/services/gateway/gateway-ws-client.ts
    - packages/backend/src/plugins/gateway.ts
  modified:
    - packages/backend/src/config/env.ts
    - packages/backend/src/app.ts
    - packages/backend/package.json

key-decisions:
  - "FastifyBaseLogger over pino Logger for type compatibility with Fastify's logger type"
  - "Non-blocking gateway startup: start() resolves even if gateway unreachable, reconnect handles retry"
  - "Gateway health check is informational (disconnected), not blocking overall health status"
  - "Tick timeout at 2x tickIntervalMs triggers reconnect for dead connection detection"

patterns-established:
  - "Gateway singleton: single GatewayWsClient per backend process, decorated on app.gateway"
  - "Chat event routing via sessionKey: multiple concurrent listeners filter events by sessionKey"
  - "Reconnect with exponential backoff + jitter, capped at 30s"
  - "RPC correlation via Map<requestId, Promise> with timeout cleanup"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-02-22
---

# Phase 10 Plan 01: Gateway WebSocket Client Foundation Summary

**Persistent WebSocket client for OpenClaw Gateway v3 protocol with auto-reconnect, RPC correlation, and chat event routing via Fastify plugin**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-22T20:34:39Z
- **Completed:** 2026-02-22T20:38:25Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- GatewayWsClient class with full connect handshake, exponential backoff reconnection, RPC request/response correlation, and chat event listener routing
- Typed interfaces for all OpenClaw Gateway protocol v3 frame types (RpcRequest, RpcResponse, GatewayEvent, ChatEvent, ConnectParams, AgentParams, etc.)
- Fastify plugin decorating `app.gateway` with singleton lifecycle management (start on register, stop on close)
- Health check reflects gateway WebSocket connection status (informational)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install ws dependency and create WebSocket protocol types** - `97e5880` (chore)
2. **Task 2: Build GatewayWsClient class and Fastify gateway plugin** - `c6d7baf` (feat)

## Files Created/Modified
- `packages/backend/src/services/gateway/types.ts` - Typed interfaces for WebSocket protocol v3 (RPC frames, ChatEvent, AgentParams, ConnectParams, HelloOkPayload, GatewayWsClientOptions)
- `packages/backend/src/services/gateway/gateway-ws-client.ts` - GatewayWsClient class: connect handshake, auto-reconnect, RPC correlation, chat event routing, tick timeout, graceful shutdown
- `packages/backend/src/plugins/gateway.ts` - Fastify plugin: creates GatewayWsClient singleton, decorates app.gateway, onClose hook
- `packages/backend/src/config/env.ts` - Added OPENCLAW_GATEWAY_WS_URL with default ws://localhost:18789
- `packages/backend/src/app.ts` - Registers gateway plugin (skipped in test mode), health check includes gateway status
- `packages/backend/package.json` - Added ws 8.x and @types/ws dependencies

## Decisions Made
- Used `FastifyBaseLogger` instead of pino `Logger` for constructor type -- FastifyBaseLogger is the actual type on `fastify.log` and avoids `msgPrefix` type mismatch
- Non-blocking startup: `client.start()` is called without await in the plugin, and errors are caught and logged. Gateway may not be available at backend startup and the reconnection logic handles delayed availability.
- Gateway health check is informational, not blocking -- DB and Redis are required for `healthy`, but gateway being disconnected only shows as `"disconnected"` without degrading overall status. This avoids failing health checks during gateway restarts.
- Tick timeout uses 2x the tickIntervalMs value from the hello-ok policy (default 15s interval, 30s timeout) as the dead connection detection threshold

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Logger type incompatibility**
- **Found during:** Task 2 (GatewayWsClient class)
- **Issue:** Plan specified `import type { Logger } from 'pino'` but Fastify's `fastify.log` is typed as `FastifyBaseLogger`, not pino's `Logger`. The `msgPrefix` property was missing.
- **Fix:** Changed constructor parameter and field type from `Logger` to `FastifyBaseLogger` from `'fastify'`
- **Files modified:** packages/backend/src/services/gateway/gateway-ws-client.ts
- **Verification:** `tsc --noEmit` passes for all gateway files
- **Committed in:** c6d7baf (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minimal -- type correction for proper Fastify integration. No scope creep.

## Issues Encountered
- Pre-existing TypeScript error in `ota-calendar-sync.test.ts` (missing `guestPhone` and `currency` fields on `OtaBookingData`) -- unrelated to this plan, not addressed (out of scope)

## User Setup Required
None - no external service configuration required. The `OPENCLAW_GATEWAY_WS_URL` env var defaults to `ws://localhost:18789` matching the existing gateway setup.

## Next Phase Readiness
- `app.gateway` singleton is available for all subsequent plans to use
- Plan 10-02 can now replace assistant chat routes to use WebSocket bridge instead of HTTP proxy
- Plan 10-03 can replace hook delivery and draft generation with gateway RPC calls

## Self-Check: PASSED

- All 4 created files verified on disk
- Commit 97e5880 (Task 1) verified in git log
- Commit c6d7baf (Task 2) verified in git log
- `tsc --noEmit` passes (only pre-existing test error remains)

---
*Phase: 10-switch-the-backend-to-use-the-gateway-s-websocket-api*
*Completed: 2026-02-22*
