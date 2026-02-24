---
phase: 12-schema-migration-chat-history
plan: 02
subsystem: ui
tags: [react, localStorage, chat, session-persistence, hooks]

# Dependency graph
requires:
  - phase: 12-schema-migration-chat-history
    provides: "Prisma schema with BookingGuest junction table and clean compilation"
provides:
  - "localStorage chat persistence with counter-based stable session keys"
  - "Message hydration from localStorage on page refresh"
  - "ToolSummary component for restored assistant messages"
  - "Context-loss banner for gateway restart detection"
  - "Session pruning (3 sessions, 500 messages per session)"
affects: [assistant, frontend, chat-history]

# Tech tracking
tech-stack:
  added: []
  patterns: [localStorage-persistence, counter-based-session-keys, message-hydration]

key-files:
  created:
    - packages/frontend/src/lib/chat-storage.ts
    - packages/frontend/src/components/features/assistant/tool-summary.tsx
  modified:
    - packages/frontend/src/lib/hooks/use-assistant.ts
    - packages/frontend/src/components/features/assistant/chat-container.tsx
    - packages/frontend/src/components/features/assistant/message-bubble.tsx
    - packages/backend/src/modules/assistant/assistant.routes.ts

key-decisions:
  - "Counter-based session keys (dashboard:1, dashboard:2) replace timestamp-based keys for OpenClaw JSONL persistence"
  - "Messages saved to localStorage after each completed exchange (not per-chunk) to avoid write thrashing"
  - "resetSession is fully client-side (no server call) -- backend endpoint kept for backward compatibility"
  - "Context-loss banner clears on first successful streaming response, not on message send"

patterns-established:
  - "chat-storage.ts: localStorage abstraction with SSR guards, version field, and auto-pruning"
  - "isRestored flag on ChatMessage for rendering differences between live and hydrated messages"
  - "ToolSummary component for collapsed tool call display on restored messages"

requirements-completed: [CHAT-01, CHAT-02]

# Metrics
duration: 3min
completed: 2026-02-24
---

# Phase 12 Plan 02: Chat Persistence Summary

**Counter-based stable session keys with localStorage message persistence, instant hydration on refresh, tool summaries for restored messages, and context-loss banner**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-24T10:22:16Z
- **Completed:** 2026-02-24T10:25:20Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Chat messages persist in localStorage and reappear instantly on page refresh (CHAT-02)
- Stable counter-based session keys (dashboard:1, dashboard:2, ...) enable OpenClaw JSONL session continuity (CHAT-01)
- Restored messages show collapsed "Used N tools" summary instead of live animated indicators
- Amber context-loss banner warns when gateway context may have been lost after refresh
- 500-message cap per session and 3-session retention with automatic pruning

## Task Commits

Each task was committed atomically:

1. **Task 1: Create chat-storage.ts and refactor useAssistant hook** - `f93c4fd` (feat)
2. **Task 2: Add tool summary component, context-loss banner, and update message rendering** - `093be52` (feat)

## Files Created/Modified
- `packages/frontend/src/lib/chat-storage.ts` - localStorage abstraction: counter-based session keys, message read/write, session pruning
- `packages/frontend/src/lib/hooks/use-assistant.ts` - Refactored: hydrates messages on mount, saves after exchanges, stable session keys, contextMayBeLost state
- `packages/frontend/src/components/features/assistant/tool-summary.tsx` - Collapsed "Used N tools" indicator for restored messages
- `packages/frontend/src/components/features/assistant/message-bubble.tsx` - Renders ToolSummary on restored assistant messages with tool calls
- `packages/frontend/src/components/features/assistant/chat-container.tsx` - Amber context-loss banner with dismiss, destructures new hook returns
- `packages/backend/src/modules/assistant/assistant.routes.ts` - Simplified /chat/reset (session keys now client-managed)

## Decisions Made
- Counter-based session keys replace timestamp-based keys -- enables OpenClaw to accumulate JSONL transcripts across page refreshes
- Messages saved after each completed exchange (not per SSE chunk) to avoid localStorage write thrashing
- resetSession is fully client-side now (no server roundtrip) -- faster UX, backend endpoint kept for backward compatibility
- Context-loss banner clears on first successful streaming response (not on send) for accurate detection
- Old timestamp-format session keys auto-detected and migrated to counter-based on first load

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 12 is now complete (both plans done)
- Phase 13 (Backend Multi-Guest Bookings) can proceed -- the BookingGuest junction table exists and Prisma client is regenerated
- Phase 14 (Backend Payment Tracking) can proceed in parallel -- payment schema is ready

## Self-Check: PASSED

All 6 files verified present. Both task commits (f93c4fd, 093be52) found in git log.

---
*Phase: 12-schema-migration-chat-history*
*Completed: 2026-02-24*
