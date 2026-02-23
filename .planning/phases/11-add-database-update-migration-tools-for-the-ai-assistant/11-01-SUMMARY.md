---
phase: 11-add-database-update-migration-tools-for-the-ai-assistant
plan: 01
subsystem: assistant
tags: [openclaw, plugin, tools, confirmation, api-client, guest-crud, booking-crud]

# Dependency graph
requires:
  - phase: 08-assistant-actions-automation
    provides: two-step confirmation pattern (storePendingAction, confirm_action), ApiClient, action tools
provides:
  - 5 new assistant tools: prepare_update_guest, prepare_delete_guest, prepare_merge_guests, prepare_update_booking, prepare_cancel_booking
  - 5 new confirm_action switch cases for guest and booking mutations
  - ApiClient 204 No Content handling for DELETE endpoints
  - Extended PendingAction type union (14 action types)
affects: [11-02-PLAN, assistant-plugin]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Before/after diff pattern for update tools -- fetch current, compare fields, show changes"
    - "Consistent two-step flow for all mutation types: prepare -> confirm"

key-files:
  created: []
  modified:
    - packages/assistant/openclaw-plugin/lib/api-client.ts
    - packages/assistant/openclaw-plugin/lib/confirmation.ts
    - packages/assistant/openclaw-plugin/tools/guests.ts
    - packages/assistant/openclaw-plugin/tools/bookings.ts
    - packages/assistant/openclaw-plugin/tools/actions.ts

key-decisions:
  - "204 No Content check placed before JSON parsing to prevent SyntaxError on DELETE responses"
  - "PendingAction type union extended upfront for all 14 types (both Plan 01 and Plan 02) to avoid type errors during incremental development"
  - "Update tools use field-level diff with JSON.stringify for deep comparison on arrays (tags)"

patterns-established:
  - "Update tool diff pattern: fetch current -> compare each provided field -> build diff + changes -> storePendingAction"
  - "Archive terminology for soft-delete tools (delete_guest shows 'Archive guest' to match business meaning)"

requirements-completed: [ASST-10, ASST-11, ASST-12]

# Metrics
duration: 3min
completed: 2026-02-23
---

# Phase 11 Plan 01: Guest/Booking Mutation Tools Summary

**5 new assistant mutation tools (update/delete/merge guests, update/cancel bookings) with before/after diff previews and ApiClient 204 fix**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-23T11:23:19Z
- **Completed:** 2026-02-23T11:26:25Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Fixed ApiClient to handle 204 No Content responses without JSON parse errors (enables DELETE operations)
- Extended PendingAction type union from 5 to 14 action types, covering all Plan 01 and Plan 02 tools
- Added 5 new prepare_* tools with proper confirmation flow: update guest (with diff), archive guest, merge guests, update booking (with diff), cancel booking
- Added 5 new confirm_action switch cases that execute the actual API calls (PATCH/DELETE/POST)
- Guest tools now total 7 (3 read + 1 create + 3 new), booking tools now total 4 (2 read + 2 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix ApiClient 204 handling and extend PendingAction type union** - `e57089a` (fix)
2. **Task 2: Add guest update/delete/merge tools and booking update/cancel tools** - `70e090c` (feat)
3. **Task 3: Add confirm_action handler cases for guest and booking actions** - `227c191` (feat)

## Files Created/Modified
- `packages/assistant/openclaw-plugin/lib/api-client.ts` - Added 204 status check before JSON parsing
- `packages/assistant/openclaw-plugin/lib/confirmation.ts` - Extended PendingAction type union to 14 types
- `packages/assistant/openclaw-plugin/tools/guests.ts` - Added prepare_update_guest, prepare_delete_guest, prepare_merge_guests tools
- `packages/assistant/openclaw-plugin/tools/bookings.ts` - Added prepare_update_booking, prepare_cancel_booking tools
- `packages/assistant/openclaw-plugin/tools/actions.ts` - Added 5 new confirm_action switch cases

## Decisions Made
- 204 No Content check placed before JSON parsing to prevent SyntaxError on DELETE responses
- PendingAction type union extended upfront for all 14 types (both Plan 01 and Plan 02) to avoid incremental type errors
- Update tools use field-level diff with JSON.stringify for deep comparison on arrays (tags)
- Archive terminology used for soft-delete tools (user-facing says "Archive guest" not "Delete guest")
- Merge guests tool fetches both guests to display names in confirmation summary

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 can add event and conversation mutation tools immediately -- PendingAction type union already includes their types
- All 5 new confirm_action cases use the 204-safe ApiClient for DELETE operations
- 4 remaining action types (update_event, delete_event, register_guest_for_event, update_conversation) ready for Plan 02

## Self-Check: PASSED

All files verified present. All 3 commits verified in git history.

---
*Phase: 11-add-database-update-migration-tools-for-the-ai-assistant*
*Completed: 2026-02-23*
