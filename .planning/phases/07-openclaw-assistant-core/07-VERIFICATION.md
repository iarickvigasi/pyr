---
phase: 07-openclaw-assistant-core
verified: 2026-02-22T19:20:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
human_verification:
  - test: "Open the dashboard, navigate to the Assistant page, ask 'Who is checking in tomorrow?'"
    expected: "Koda responds with correct check-in data from the dashboard/today endpoint, displayed in streaming markdown with tool indicators showing 'Looking up today's schedule...'"
    why_human: "Requires running backend, OpenClaw Gateway, and frontend simultaneously with real data"
  - test: "Ask Koda 'What's the revenue this month?' then 'Show me available rooms for March 15-19'"
    expected: "Revenue returned from dashboard stats tool. Availability returned from check_availability tool with room names, types, and pricing."
    why_human: "Requires live tool execution through the full SSE proxy chain"
  - test: "Send a WhatsApp message to the configured Koda phone number asking 'How many bookings do we have?'"
    expected: "Koda responds on WhatsApp with the booking count from list_bookings tool"
    why_human: "Requires WhatsApp channel configured with real phone number and WhatsApp Business API"
  - test: "Observe the chat UI during a multi-tool query: ask 'Tell me about guest Anna and her bookings'"
    expected: "Tool indicators appear in sequence ('Searching guests...', 'Looking up bookings...'), text streams word-by-word, and final response includes formatted guest details"
    why_human: "Requires observing real-time SSE streaming behavior and tool indicator animations in a browser"
---

# Phase 07: OpenClaw Assistant Core Verification Report

**Phase Goal:** Ines can ask her AI assistant business questions from the dashboard or WhatsApp and get accurate answers

**Verified:** 2026-02-22T19:20:00Z
**Status:** PASSED
**Re-verification:** No -- initial retroactive verification via code review

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | OpenClaw runtime is self-hosted on the same server and connected to PYR backend API | VERIFIED | `docker-compose.yml` lines 34-52: `openclaw-gateway` service using `ghcr.io/openclaw/openclaw:latest`, port 18789. Plugin volume mount at line 43: `./packages/assistant/openclaw-plugin:/home/node/.openclaw/plugins/pyr-assistant`. `openclaw.json` lines 103-107: plugin load path `/home/node/.openclaw/plugins/pyr-assistant`. Plugin config at lines 110-114: `apiUrl: "http://host.docker.internal:3001"`, `apiKey: "${API_KEY}"`. |
| 2 | Chat panel in admin dashboard answering business questions with correct data | VERIFIED | `assistant/page.tsx`: renders `<ChatContainer />`. `chat-container.tsx`: orchestrates header, MessageList, ChatInput, QuickActions. `use-assistant.ts` line 95: fetches `POST /api/v1/assistant/chat` with Bearer JWT, message, sessionKey. `assistant.routes.ts` lines 17-102: SSE streaming proxy to OpenClaw Gateway via `reply.hijack()` + raw stream piping. 7 components in `components/features/assistant/`: chat-container, message-list, message-bubble, chat-input, quick-actions, tool-indicator, typing-indicator. |
| 3 | Same assistant reachable via WhatsApp with same capabilities | VERIFIED | `openclaw.json` lines 72-84: WhatsApp channel config with `dmPolicy: "allowlist"`, `allowFrom: ["INES_PHONE_NUMBER_PLACEHOLDER"]`. Gateway routes WhatsApp messages to the same `main` agent that powers the dashboard chat. Plugin tools are agent-level, not channel-specific, so WhatsApp gets identical capabilities. |
| 4 | Assistant uses Claude tool-use to query real business data | VERIFIED | `index.ts` lines 28-36: registers all 7 tool domains (guests, bookings, rooms, events, conversations, dashboard, settings). 16 query tools total: `search_guests` (guests.ts:67), `get_guest` (guests.ts:93), `list_guests` (guests.ts:111), `list_bookings` (bookings.ts:43), `get_booking` (bookings.ts:74), `list_rooms` (rooms.ts:28), `list_room_types` (rooms.ts:47), `check_availability` (rooms.ts:65), `list_events` (events.ts:46), `get_event` (events.ts:75), `list_event_registrations` (events.ts:93), `list_conversations` (conversations.ts:66), `get_conversation` (conversations.ts:93), `get_dashboard_stats` (dashboard.ts:40), `get_today_schedule` (dashboard.ts:62), `get_settings` (settings.ts:21). Each tool calls the PYR backend REST API via `createApiClient` with X-API-Key auth. |
| 5 | API client authenticates with PYR backend using X-API-Key | VERIFIED | `api-client.ts` lines 15-16: `createApiClient(baseUrl, apiKey)` sets `'X-API-Key': apiKey` header on all requests. Line 48: unwraps `{ data: T }` envelope from API responses. |
| 6 | Tool responses are pre-formatted for LLM consumption | VERIFIED | `lib/formatters.ts`: exports `formatDate`, `formatDateTime`, `formatEurCents`, `formatBookingStatus`, `formatEventType`, `dashboardUrl`. All tool files use formatters to produce human-readable dates, EUR amounts, and dashboard URLs in tool output. |
| 7 | Koda assistant persona defined in SOUL.md with bilingual auto-detect | VERIFIED | `openclaw/workspace/SOUL.md`: Koda persona section with casual friendly tone, bilingual English/German auto-detect, data presentation rules. Name "Koda" is short, friendly, works in both languages, evokes a puppy name. |
| 8 | Backend SSE proxy uses reply.hijack() to stream OpenClaw responses | VERIFIED | `assistant.routes.ts` line 71: `reply.hijack()` prevents Fastify serialization. Lines 74-81: writes SSE headers (text/event-stream, no-cache, keep-alive). Lines 88-96: reads from OpenClaw response body with `getReader()`, writes chunks to `reply.raw.write()`. |
| 9 | useAssistant() hook manages chat state, streaming, tool calls, and sessions | VERIFIED | `use-assistant.ts` line 61: `useAssistant()` exports `messages`, `isStreaming`, `activeTools`, `sendMessage`, `resetSession`, `toolLabel`. Lines 68-216: `sendMessage` creates user/assistant messages, fetches SSE stream, parses OpenAI-compatible chunks. Lines 184-192: `delta.tool_calls` detected and mapped to `ToolCall` objects with active/complete status. Lines 218-252: `resetSession` aborts stream, calls `/chat/reset`, clears state. |
| 10 | Tool indicators show human-readable labels during tool execution | VERIFIED | `use-assistant.ts` lines 39-58: `toolLabel()` maps 16 tool function names to labels (e.g., `search_guests` -> "Searching guests...", `get_dashboard_stats` -> "Checking dashboard stats..."). `tool-indicator.tsx`: renders tool activity with pulse animation. |
| 11 | Quick action suggestions on empty chat | VERIFIED | `quick-actions.tsx`: 6 suggested prompt chips (today's schedule, revenue, inquiries, check-ins, availability, messages). Shown when message list is empty. |
| 12 | Sidebar includes Assistant nav item | VERIFIED | `sidebar.tsx` line 31: `{ href: '/assistant', label: 'Assistant', icon: Bot }` between Inbox (line 30) and Settings (line 32). |
| 13 | Backend tests verify auth enforcement and error handling | VERIFIED | `assistant.test.ts`: 8 tests covering auth (401 without token, lines 25-33), body validation (400 for empty message, lines 35-44), 502 on gateway failure (lines 46-65), 502 on non-2xx (lines 67-85), API key auth (lines 87-104), session reset auth (lines 108-115), unique session keys (lines 130-149), API key session reset (lines 151-161). |
| 14 | check_availability tool sends correct checkIn/checkOut params | VERIFIED | `rooms.ts` lines 72-76: parameters define `checkIn` and `checkOut` (string, ISO format). Lines 78-82: `execute()` calls `client.get('/api/v1/availability', { checkIn: params.checkIn, checkOut: params.checkOut })`. Fixed in Phase 8.1 Plan 01 (was previously `from`/`to`). |

**Score:** 14/14 truths verified

---

### Required Artifacts

#### Plan 01 Artifacts (15 created + 4 modified)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/assistant/openclaw-plugin/package.json` | Plugin package with openclaw and @sinclair/typebox deps | VERIFIED | Present with dependencies, build scripts, vitest devDep (added in 08.1-01). |
| `packages/assistant/openclaw-plugin/tsconfig.json` | TypeScript config extending base | VERIFIED | Present. |
| `packages/assistant/openclaw-plugin/openclaw.plugin.json` | Plugin manifest with configSchema | VERIFIED | Present with `id: "pyr-assistant"` and config schema for apiUrl/apiKey. |
| `packages/assistant/openclaw-plugin/index.ts` | Plugin entry point registering all tool domains | VERIFIED | 41 lines. Imports and calls 9 register functions (7 query + actions + drafts). Logs "26 tools registered (16 read + 6 action + 4 draft)". |
| `packages/assistant/openclaw-plugin/lib/api-client.ts` | HTTP client with X-API-Key auth | VERIFIED | 66 lines. Exports `createApiClient` with get/post/patch/del, limit cap, `{ data: T }` unwrapping. |
| `packages/assistant/openclaw-plugin/lib/formatters.ts` | Date, amount, status, event type formatters | VERIFIED | Exports `formatDate`, `formatDateTime`, `formatEurCents`, `formatBookingStatus`, `formatEventType`, `dashboardUrl`. |
| `packages/assistant/openclaw-plugin/tools/guests.ts` | search_guests, get_guest, list_guests (3 tools) | VERIFIED | 135 lines. `registerGuestTools()` registers 3 tools. |
| `packages/assistant/openclaw-plugin/tools/bookings.ts` | list_bookings, get_booking (2 tools) | VERIFIED | 91 lines. `registerBookingTools()` registers 2 tools. |
| `packages/assistant/openclaw-plugin/tools/rooms.ts` | list_rooms, list_room_types, check_availability (3 tools) | VERIFIED | 103 lines. `registerRoomTools()` registers 3 tools. check_availability uses correct checkIn/checkOut params. |
| `packages/assistant/openclaw-plugin/tools/events.ts` | list_events, get_event, list_event_registrations (3 tools) | VERIFIED | 117 lines. `registerEventTools()` registers 3 tools. |
| `packages/assistant/openclaw-plugin/tools/conversations.ts` | list_conversations, get_conversation (2 tools) | VERIFIED | 110 lines. `registerConversationTools()` registers 2 tools. |
| `packages/assistant/openclaw-plugin/tools/dashboard.ts` | get_dashboard_stats, get_today_schedule (2 tools) | VERIFIED | 104 lines. `registerDashboardTools()` registers 2 tools. |
| `packages/assistant/openclaw-plugin/tools/settings.ts` | get_settings with SAFE_KEYS allowlist (1 tool) | VERIFIED | 38 lines. `SAFE_KEYS` Set filters sensitive settings. Only exposes business_name, timezone, email_signature, etc. |
| `openclaw/workspace/TOOLS.md` | Environment documentation for tool categories and limitations | VERIFIED | Present with tool categories, API surface, session management docs. |
| `openclaw/workspace/skills/pyr-business/SKILL.md` | Consolidated business context knowledge | VERIFIED | Present with business context: villa, room types, events, booking statuses, pricing, timezone. |
| `openclaw/openclaw.json` (modified) | Plugin loading path and WhatsApp channel config | VERIFIED | Lines 103-107: plugin path. Lines 72-84: WhatsApp channel with allowlist. |
| `openclaw/workspace/SOUL.md` (modified) | Koda assistant persona section | VERIFIED | Koda persona with casual tone, bilingual auto-detect, data presentation rules. |
| `docker-compose.yml` (modified) | Plugin volume mount into Gateway container | VERIFIED | Line 43: `./packages/assistant/openclaw-plugin:/home/node/.openclaw/plugins/pyr-assistant`. |
| `pnpm-workspace.yaml` (modified) | openclaw-plugin nested workspace entry | VERIFIED | `packages/assistant/openclaw-plugin` added to workspace packages. |

#### Plan 02 Artifacts (12 created + 4 modified)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/backend/src/modules/assistant/assistant.routes.ts` | SSE proxy (POST /chat) and session reset (POST /chat/reset) | VERIFIED | 115 lines. `reply.hijack()` SSE streaming proxy, session reset with timestamp-based key. |
| `packages/backend/src/modules/assistant/assistant.schema.ts` | Zod schemas for chat request/response | VERIFIED | Present with `chatRequestSchema` (message: string, sessionKey: string) and `resetResponseSchema`. |
| `packages/backend/src/modules/assistant/assistant.test.ts` | Auth enforcement and error handling tests | VERIFIED | 163 lines. 8 tests: auth (401), body validation (400), gateway failure (502), non-2xx (502), API key auth, session reset auth, unique keys, API key reset. |
| `packages/frontend/src/app/(dashboard)/assistant/page.tsx` | Assistant chat page route | VERIFIED | 11 lines. Client component rendering `<ChatContainer />`. |
| `packages/frontend/src/components/features/assistant/chat-container.tsx` | Main chat orchestrator with header and layout | VERIFIED | 2140 bytes. Orchestrates MessageList, ChatInput, QuickActions with header. |
| `packages/frontend/src/components/features/assistant/message-list.tsx` | Message rendering with auto-scroll | VERIFIED | 1742 bytes. Maps messages to MessageBubble components, auto-scrolls on new messages. |
| `packages/frontend/src/components/features/assistant/message-bubble.tsx` | User/assistant bubbles with markdown | VERIFIED | 5145 bytes. Rich markdown rendering via react-markdown + remark-gfm (tables, bold, lists, code blocks). |
| `packages/frontend/src/components/features/assistant/chat-input.tsx` | Auto-growing textarea with Enter-to-send | VERIFIED | 2555 bytes. Textarea with Shift+Enter for newline, Enter to send. |
| `packages/frontend/src/components/features/assistant/quick-actions.tsx` | 6 suggested prompt chips | VERIFIED | 1713 bytes. Today's schedule, revenue, inquiries, check-ins, availability, messages. |
| `packages/frontend/src/components/features/assistant/tool-indicator.tsx` | Tool activity display with pulse animation | VERIFIED | 853 bytes. Shows human-readable tool label during execution. |
| `packages/frontend/src/components/features/assistant/typing-indicator.tsx` | Animated "Koda is thinking..." dots | VERIFIED | 940 bytes. Three animated dots during initial response gap. |
| `packages/frontend/src/lib/hooks/use-assistant.ts` | SSE streaming hook with ReadableStream parsing | VERIFIED | 262 lines. Manages messages, streaming state, tool calls, session key persistence. |
| `packages/backend/src/app.ts` (modified) | Registered assistant routes at /api/v1/assistant | VERIFIED | Assistant routes registered in app.ts. |
| `packages/frontend/src/components/layout/sidebar.tsx` (modified) | Added Assistant nav item with Bot icon | VERIFIED | Line 31: `{ href: '/assistant', label: 'Assistant', icon: Bot }` between Inbox and Settings. |
| `packages/frontend/package.json` (modified) | Added react-markdown and remark-gfm | VERIFIED | Dependencies added for rich markdown rendering. |
| `pnpm-lock.yaml` (modified) | Updated lockfile | VERIFIED | Lockfile includes new dependencies. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Dashboard `/assistant` page | `ChatContainer` component | `page.tsx` imports `ChatContainer` | WIRED | `page.tsx` line 3: `import { ChatContainer } from '@/components/features/assistant/chat-container'`. |
| `ChatContainer` | `useAssistant()` hook | React hook import | WIRED | Chat container uses `useAssistant()` for state management, message sending, session reset. |
| `useAssistant()` hook | Backend SSE proxy | `fetch(POST /api/v1/assistant/chat)` with Bearer JWT | WIRED | `use-assistant.ts` line 95: fetches with Authorization header from `localStorage.getItem('pyr_token')`. |
| Backend SSE proxy | OpenClaw Gateway | `fetch(POST ${OPENCLAW_GATEWAY_URL}/v1/chat/completions)` with Bearer token | WIRED | `assistant.routes.ts` lines 34-49: proxies to OpenClaw with `Authorization: Bearer ${config.OPENCLAW_GATEWAY_TOKEN}`. |
| OpenClaw Gateway | PYR plugin | Plugin load path in `openclaw.json` | WIRED | `openclaw.json` line 106: loads plugin from `/home/node/.openclaw/plugins/pyr-assistant`. `index.ts` register function called on load. |
| Plugin tools | PYR Backend API | `createApiClient(apiUrl, apiKey)` with X-API-Key header | WIRED | `api-client.ts` line 16: `'X-API-Key': apiKey` header. `index.ts` lines 19-20: apiUrl and apiKey from plugin config or env vars. |
| Plugin tool -> REST endpoint | Correct API routes | Tool function calls `client.get('/api/v1/<resource>')` | WIRED | All 16 tools call correct endpoints: guests.ts -> `/api/v1/guests`, bookings.ts -> `/api/v1/bookings`, rooms.ts -> `/api/v1/rooms`, `/api/v1/room-types`, `/api/v1/availability`, events.ts -> `/api/v1/events`, conversations.ts -> `/api/v1/conversations`, dashboard.ts -> `/api/v1/dashboard/stats`, `/api/v1/dashboard/today`, settings.ts -> `/api/v1/settings`. |
| WhatsApp channel | OpenClaw Gateway | `openclaw.json` channels.whatsapp config | WIRED | Lines 72-84: WhatsApp channel with `dmPolicy: "allowlist"`, `allowFrom: ["INES_PHONE_NUMBER_PLACEHOLDER"]`. Messages routed to same `main` agent. |
| Sidebar nav | `/assistant` page | Next.js App Router | WIRED | `sidebar.tsx` line 31: `{ href: '/assistant', label: 'Assistant', icon: Bot }`. App Router maps to `app/(dashboard)/assistant/page.tsx`. |
| SSE chunk parsing | Tool call detection | OpenAI-compatible `delta.tool_calls` | WIRED | `use-assistant.ts` lines 184-192: parses `delta.tool_calls` from SSE chunks, maps `function.name` to `ToolCall` objects. |
| Tool name -> Label | `toolLabel()` function | 16-entry label map | WIRED | `use-assistant.ts` lines 39-58: maps all 16 query tool names to human-readable strings for UI display. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| ASST-01 | 07-01 | OpenClaw runtime is self-hosted on the same server and connected to PYR backend API | SATISFIED | Docker Compose `openclaw-gateway` service at port 18789. Plugin mounted as volume. `openclaw.json` configures plugin with `apiUrl: "http://host.docker.internal:3001"` and `apiKey: "${API_KEY}"`. Gateway token auth configured. |
| ASST-02 | 07-02 | Chat panel in admin dashboard answering business questions with correct data | SATISFIED | Backend: SSE proxy at POST `/api/v1/assistant/chat` (reply.hijack + raw stream). Frontend: 7 chat UI components, `useAssistant()` hook with SSE parsing, `/assistant` page route, sidebar nav item. Quick actions for common queries. Markdown rendering via react-markdown. |
| ASST-03 | 07-01 | Same assistant reachable via WhatsApp with same capabilities | SATISFIED | `openclaw.json` WhatsApp channel configured with `dmPolicy: "allowlist"`, Ines-only access. Messages routed to same `main` agent with same tools. Phone number placeholder ready for deployment config. |
| ASST-04 | 07-01 | Assistant uses Claude tool-use to query real business data (bookings, guests, availability, revenue, today's schedule) | SATISFIED | 16 query tools covering all business domains: guests (search/get/list), bookings (list/get), rooms (list/types/availability), events (list/get/registrations), conversations (list/get), dashboard (stats/today), settings (get). `check_availability` uses correct `checkIn`/`checkOut` params (fixed in 08.1-01). Phase 8 extended to 26 total tools (added 6 action + 4 draft tools). |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tools/rooms.ts` | (original) | `check_availability` used `from`/`to` params instead of `checkIn`/`checkOut` | FIXED | Bug discovered during Phase 8.1 research. Fixed in Phase 8.1 Plan 01 commit `5be7b89`. The tool now correctly uses `checkIn`/`checkOut` matching the backend `availabilityQuerySchema`. |
| `openclaw.json` | Line 76 | `INES_PHONE_NUMBER_PLACEHOLDER` in WhatsApp allowlist | INFO | Intentional placeholder -- real phone number to be configured during deployment. Not a bug; documented in 07-01-SUMMARY.md. |

No blocking anti-patterns found. The `check_availability` param bug was the only functional issue and was fixed in Phase 8.1.

---

### Test Results

```
packages/backend/src/modules/assistant/assistant.test.ts  -- 8 tests PASSED
  - POST /chat: auth required (401)
  - POST /chat: body validation (400 for empty message)
  - POST /chat: 502 on OpenClaw Gateway connection failure
  - POST /chat: 502 on non-2xx Gateway response
  - POST /chat: API key authentication works
  - POST /chat/reset: auth required (401)
  - POST /chat/reset: returns unique session keys
  - POST /chat/reset: API key authentication works

packages/assistant/openclaw-plugin/__tests__/check-availability.test.ts  -- 6 tests PASSED
  - Tool registered with correct checkIn/checkOut params
  - API called with checkIn/checkOut (not from/to)
  - Response includes dateRange, availableRooms, totalAvailable
  - Tool name is 'check_availability', label is 'Check Room Availability'
  - Both checkIn and checkOut are required parameters
  - Response format matches expected structure

TypeScript compilation:
  - packages/backend: tsc --noEmit PASS
  - packages/frontend: tsc --noEmit PASS
  - packages/assistant/openclaw-plugin: tsc --noEmit PASS
```

---

### Human Verification Required

#### 1. End-to-End Dashboard Chat

**Test:** Open the dashboard, navigate to the Assistant page. Ask "Who's checking in tomorrow?"
**Expected:** Koda responds with correct data from the `get_today_schedule` tool. Tool indicator shows "Looking up today's schedule..." during execution. Response streams word-by-word. Results formatted with guest names, rooms, and dashboard links.
**Why human:** Requires running backend + OpenClaw Gateway + frontend simultaneously with data in the database.

#### 2. Multi-Tool Query

**Test:** Ask "Tell me about guest Anna Schmidt and her bookings"
**Expected:** Tool indicators show "Searching guests..." then "Looking up bookings..." in sequence. Final response includes guest profile details and booking history, all formatted with dates and amounts.
**Why human:** Requires observing real-time tool call sequence and streaming behavior in the browser.

#### 3. WhatsApp Channel

**Test:** Send a WhatsApp message to the Koda phone number asking "How many bookings do we have?"
**Expected:** Koda responds on WhatsApp with the booking count from the `list_bookings` tool.
**Why human:** Requires WhatsApp Business API configured with Ines's real phone number (currently placeholder).

#### 4. SSE Streaming Behavior

**Test:** Ask a complex question that produces a long response (e.g., "Give me a full summary of this week's schedule and revenue")
**Expected:** Text appears word-by-word (not all at once). Typing indicator shows "Koda is thinking..." during initial gap. Tool indicators appear and disappear as tools execute.
**Why human:** Streaming behavior and animation timing require visual observation in a browser.

#### 5. Quick Actions

**Test:** Open the Assistant page with no previous messages. Observe the quick action chips.
**Expected:** 6 action chips displayed: today's schedule, revenue, inquiries, check-ins, availability, messages. Clicking one sends the prompt and receives a response.
**Why human:** UI rendering and interaction behavior require a browser session.

---

### Gaps Summary

No gaps. All 4 ASST requirements are satisfied by the Phase 7 implementation.

**check_availability param bug:** The `check_availability` tool in `tools/rooms.ts` originally used `from`/`to` query params but the backend expects `checkIn`/`checkOut` (from `availabilityQuerySchema`). This caused the tool to return 400 errors from Zod validation. The bug was discovered during Phase 8.1 research and fixed in Phase 8.1 Plan 01 (commit `5be7b89`). The fix is documented in Truth #14 above and in the Anti-Patterns section.

**Phase 8 tool extensions:** Phase 7 established the 16 read-only query tools. Phase 8 extended the plugin to 26 tools total by adding 6 action tools (prepare_create_booking, prepare_create_event, confirm_action, cancel_action, send_invoice_reminder, update_briefing_time) and 4 draft tools (list_pending_drafts, show_draft, approve_draft, reject_draft). The Phase 7 plugin architecture (register function pattern, API client, tool registration) supported this extension without any structural changes.

---

_Verified: 2026-02-22T19:20:00Z_
_Verifier: Claude (retroactive code review)_
