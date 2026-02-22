---
phase: 07-openclaw-assistant-core
plan: 01
subsystem: assistant
tags: [openclaw, plugin, tools, whatsapp, typebox, ai-assistant]

# Dependency graph
requires:
  - phase: 04-ai-communication-engine
    provides: OpenClaw Gateway Docker config, SOUL.md persona, hooks API for draft generation
provides:
  - OpenClaw plugin with 16 business query tools (guests, bookings, rooms, events, conversations, dashboard, settings)
  - "Koda" assistant persona in SOUL.md with bilingual auto-detect
  - TOOLS.md environment documentation
  - Consolidated pyr-business SKILL.md with business context knowledge
  - WhatsApp channel config in openclaw.json with Ines-only allowlist
  - Docker Compose plugin volume mount
affects: [07-02-PLAN (dashboard chat UI + backend proxy), 08-assistant-actions]

# Tech tracking
tech-stack:
  added: ["@sinclair/typebox ^0.34", "openclaw (plugin-sdk)"]
  patterns: ["OpenClaw plugin tool registration via api.registerTool()", "API client with X-API-Key auth", "Pre-formatted tool responses with dashboard URLs"]

key-files:
  created:
    - packages/assistant/openclaw-plugin/package.json
    - packages/assistant/openclaw-plugin/tsconfig.json
    - packages/assistant/openclaw-plugin/openclaw.plugin.json
    - packages/assistant/openclaw-plugin/index.ts
    - packages/assistant/openclaw-plugin/lib/api-client.ts
    - packages/assistant/openclaw-plugin/lib/formatters.ts
    - packages/assistant/openclaw-plugin/tools/guests.ts
    - packages/assistant/openclaw-plugin/tools/bookings.ts
    - packages/assistant/openclaw-plugin/tools/rooms.ts
    - packages/assistant/openclaw-plugin/tools/events.ts
    - packages/assistant/openclaw-plugin/tools/conversations.ts
    - packages/assistant/openclaw-plugin/tools/dashboard.ts
    - packages/assistant/openclaw-plugin/tools/settings.ts
    - openclaw/workspace/TOOLS.md
    - openclaw/workspace/skills/pyr-business/SKILL.md
  modified:
    - openclaw/openclaw.json
    - openclaw/workspace/SOUL.md
    - docker-compose.yml
    - pnpm-workspace.yaml

key-decisions:
  - "OpenClawPluginApi from openclaw/plugin-sdk for correct type-safe tool registration"
  - "pluginConfig (not config) for plugin-specific settings with env var fallback"
  - "AgentTool requires label field for UI display alongside name/description"
  - "16 tools total: guests(3) + bookings(2) + rooms(3) + events(3) + conversations(2) + dashboard(2) + settings(1)"
  - "Koda as assistant persona name -- short, friendly, works in EN/DE, evokes a puppy name"
  - "SAFE_KEYS allowlist in settings tool to prevent sensitive credential exposure"
  - "Plugin mounted as separate volume (not inside ./openclaw) since source lives in packages/"

patterns-established:
  - "Plugin tool pattern: registerXxxTools(api, client) per domain, each tool returns { content: [{ type: text, text: JSON }], details: {} }"
  - "API client pattern: createApiClient(baseUrl, apiKey) with get/post methods, auto limit=20, unwraps { data: T } envelope"
  - "Formatter pattern: Pre-format dates, amounts, statuses in tool responses for reduced LLM formatting work"

requirements-completed: [ASST-01, ASST-03, ASST-04]

# Metrics
duration: 9min
completed: 2026-02-22
---

# Phase 7 Plan 01: OpenClaw Plugin & Workspace Summary

**OpenClaw plugin with 16 read-only business query tools, Koda assistant persona, WhatsApp channel config, and Docker Compose plugin mount**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-22T11:36:58Z
- **Completed:** 2026-02-22T11:46:14Z
- **Tasks:** 3
- **Files modified:** 19

## Accomplishments
- OpenClaw plugin package with 16 tools covering all PYR read endpoints (guests, bookings, rooms, room types, availability, events, registrations, conversations, dashboard stats, today schedule, settings)
- API client with X-API-Key auth, 20-item default limit, and { data: T } envelope unwrapping
- Koda assistant persona in SOUL.md with casual friendly tone, bilingual auto-detect, data presentation rules
- Consolidated business context SKILL.md and environment TOOLS.md
- openclaw.json updated with plugin loading path and WhatsApp channel (Ines-only allowlist)
- Docker Compose volume mount wiring plugin into Gateway container

## Task Commits

Each task was committed atomically:

1. **Task 1: Create OpenClaw plugin package with API client, formatters, and all query tools** - `471b28e` (feat)
2. **Task 2: Update OpenClaw workspace (SOUL.md persona, TOOLS.md, SKILL.md) and openclaw.json config** - `80f2f3c` (feat)
3. **Task 3: Update Docker Compose to mount plugin and install plugin dependencies** - `2a35d04` (chore)

## Files Created/Modified

### Created
- `packages/assistant/openclaw-plugin/package.json` - Plugin package with openclaw and @sinclair/typebox deps
- `packages/assistant/openclaw-plugin/tsconfig.json` - TypeScript config extending base
- `packages/assistant/openclaw-plugin/openclaw.plugin.json` - Plugin manifest with configSchema
- `packages/assistant/openclaw-plugin/index.ts` - Plugin entry point registering all 7 tool domains
- `packages/assistant/openclaw-plugin/lib/api-client.ts` - HTTP client with X-API-Key auth and limit cap
- `packages/assistant/openclaw-plugin/lib/formatters.ts` - Date, amount, status, event type formatters
- `packages/assistant/openclaw-plugin/tools/guests.ts` - search_guests, get_guest, list_guests (3 tools)
- `packages/assistant/openclaw-plugin/tools/bookings.ts` - list_bookings, get_booking (2 tools)
- `packages/assistant/openclaw-plugin/tools/rooms.ts` - list_rooms, list_room_types, check_availability (3 tools)
- `packages/assistant/openclaw-plugin/tools/events.ts` - list_events, get_event, list_event_registrations (3 tools)
- `packages/assistant/openclaw-plugin/tools/conversations.ts` - list_conversations, get_conversation (2 tools)
- `packages/assistant/openclaw-plugin/tools/dashboard.ts` - get_dashboard_stats, get_today_schedule (2 tools)
- `packages/assistant/openclaw-plugin/tools/settings.ts` - get_settings (1 tool)
- `openclaw/workspace/TOOLS.md` - Environment docs: tool categories, limitations, session management
- `openclaw/workspace/skills/pyr-business/SKILL.md` - Consolidated business context knowledge

### Modified
- `openclaw/openclaw.json` - Added plugins.load.paths and channels.whatsapp config
- `openclaw/workspace/SOUL.md` - Added Koda assistant persona section, kept email draft voice
- `docker-compose.yml` - Added plugin volume mount into Gateway container
- `pnpm-workspace.yaml` - Added openclaw-plugin nested workspace entry

## Decisions Made

- **OpenClawPluginApi type from openclaw/plugin-sdk:** The openclaw package exports types via subpath `openclaw/plugin-sdk`, not the root. `OpenClawPluginApi` (not `PluginApi`) is the correct type. Plugin config is at `api.pluginConfig` (not `api.config` which is the full OpenClaw config).
- **AgentTool requires label field:** The pi-agent-core AgentTool type extends Tool with a `label` field for UI display. All tools include both `name` (for function calling) and `label` (for human-readable display).
- **16 tools total (not 15):** The plan estimated ~15 but the exact count across 7 domains totals 16. Updated the log message to reflect actual count.
- **Koda as assistant name:** Short, friendly, works in both English and German, evokes a puppy name -- fitting for a puppy yoga retreat assistant.
- **SAFE_KEYS allowlist for settings:** Only exposes non-sensitive settings keys (business_name, timezone, etc.) to prevent credential leakage through the assistant.
- **Separate Docker volume mount for plugin:** The plugin source lives in `packages/assistant/openclaw-plugin/` which is outside the `./openclaw` directory. Mounted as a separate volume into `/home/node/.openclaw/plugins/pyr-assistant`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected OpenClaw SDK import path and types**
- **Found during:** Task 1 (plugin creation)
- **Issue:** Plan referenced `PluginApi` from `'openclaw'` but the actual SDK exports `OpenClawPluginApi` from `'openclaw/plugin-sdk'`. Also, AgentTool requires a `label` field not mentioned in the plan.
- **Fix:** Used correct import path and type name, added `label` field to all 16 tools, used `pluginConfig` instead of `config` for plugin settings, added `details: {}` to all tool return values.
- **Files modified:** All tool files + index.ts
- **Verification:** `tsc --noEmit` passes clean
- **Committed in:** 471b28e (Task 1 commit)

**2. [Rule 3 - Blocking] Added openclaw-plugin to pnpm workspace**
- **Found during:** Task 1 (plugin creation)
- **Issue:** pnpm workspace config only had `packages/*` which doesn't discover nested packages like `packages/assistant/openclaw-plugin/`
- **Fix:** Added `packages/assistant/openclaw-plugin` to pnpm-workspace.yaml
- **Files modified:** pnpm-workspace.yaml
- **Verification:** `pnpm install` completes successfully
- **Committed in:** 471b28e (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were necessary for correct functionality. No scope creep.

## Issues Encountered
None beyond the deviations noted above.

## User Setup Required
None - no external service configuration required. WhatsApp channel uses placeholder phone number (`INES_PHONE_NUMBER_PLACEHOLDER`) that will be configured during deployment.

## Next Phase Readiness
- Plugin is ready for Gateway to load on startup
- Next plan (07-02) builds the backend SSE proxy and dashboard chat UI
- WhatsApp phone number placeholder needs to be replaced with Ines's actual number before WhatsApp activation

## Self-Check: PASSED

All 18 created/modified files verified present. All 3 task commits verified in git history.

---
*Phase: 07-openclaw-assistant-core*
*Completed: 2026-02-22*
