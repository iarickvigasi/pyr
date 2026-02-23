---
phase: 11-documentation-ota-alert-fix
plan: 02
subsystem: api
tags: [zod-openapi, swagger, fastify, documentation, error-responses]

# Dependency graph
requires:
  - phase: 11-documentation-ota-alert-fix
    provides: zod-openapi extend side-effect, errorResponseSchema, Swagger tag descriptions (Plan 01)
provides:
  - .openapi({ example }) annotations on all request Zod schemas across 12 modules with realistic PYR business data
  - Error response schemas (400, 401, 404) on 6 route modules with existing success response blocks
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [".openapi({ example }) on request schema fields for Swagger documentation", "errorResponseSchema alongside success response schemas in route definitions"]

key-files:
  created: []
  modified:
    - packages/backend/src/modules/auth/auth.schema.ts
    - packages/backend/src/modules/guests/guest.schema.ts
    - packages/backend/src/modules/bookings/booking.schema.ts
    - packages/backend/src/modules/events/event.schema.ts
    - packages/backend/src/modules/rooms/room.schema.ts
    - packages/backend/src/modules/inbox/inbox.schema.ts
    - packages/backend/src/modules/dashboard/dashboard.schema.ts
    - packages/backend/src/modules/settings/settings.schema.ts
    - packages/backend/src/modules/settings/faq.schema.ts
    - packages/backend/src/modules/agent/agent.schema.ts
    - packages/backend/src/modules/calendar/calendar.schema.ts
    - packages/backend/src/modules/assistant/assistant.schema.ts
    - packages/backend/src/modules/auth/auth.routes.ts
    - packages/backend/src/modules/agent/agent.routes.ts
    - packages/backend/src/modules/calendar/calendar.routes.ts
    - packages/backend/src/modules/dashboard/dashboard.routes.ts
    - packages/backend/src/modules/settings/settings.routes.ts
    - packages/backend/src/modules/settings/faq.routes.ts

key-decisions:
  - "Error response schemas only added to routes with existing success response blocks -- fastify-type-provider-zod infers error-only response blocks as the handler return type, breaking compilation"
  - ".openapi() only on request schemas (body, query, params) -- response schemas skipped to avoid Prisma Date serialization issues"
  - "Dashboard and invoice schemas unchanged -- dashboard has response-only schemas (no request fields), invoices are a placeholder"

patterns-established:
  - "Request schema .openapi() pattern: chain .openapi({ example: value }) after all other Zod modifiers"
  - "Error response pattern: add errorResponseSchema alongside existing success response codes, never alone"

requirements-completed: [DOC-02]

# Metrics
duration: 11min
completed: 2026-02-23
---

# Phase 11 Plan 02: Swagger Enrichment Summary

**Realistic PYR business examples on all 12 module request schemas (144 .openapi() annotations) and error response schemas on 6 route modules with existing response blocks**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-23T20:35:31Z
- **Completed:** 2026-02-23T20:46:33Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments
- Added 144 `.openapi({ example })` annotations across 12 module schema files using realistic PYR business data (guest names, Cyprus phone numbers, EUR cent prices, event types, booking statuses)
- Added error response schemas (400, 401, 404) to 6 route modules that already had success response blocks (auth, agent, calendar, dashboard, settings, faq)
- TypeScript compiles cleanly with all changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add .openapi() examples to all schema files** - `95cb6f5` (feat)
2. **Task 2: Add error response schemas to route files** - `3779f4e` (feat)

## Files Created/Modified
- `packages/backend/src/modules/auth/auth.schema.ts` - Login email/password examples
- `packages/backend/src/modules/guests/guest.schema.ts` - Guest CRUD schemas with names, emails, tags, dietary needs
- `packages/backend/src/modules/bookings/booking.schema.ts` - Booking schemas with dates, prices in cents, statuses
- `packages/backend/src/modules/events/event.schema.ts` - Event schemas with types, times, capacity, locations
- `packages/backend/src/modules/rooms/room.schema.ts` - Room type, room, season, availability schemas with pricing
- `packages/backend/src/modules/inbox/inbox.schema.ts` - Conversation, message, reply, draft, attachment schemas
- `packages/backend/src/modules/dashboard/dashboard.schema.ts` - Import only (response-only module)
- `packages/backend/src/modules/settings/settings.schema.ts` - Settings key/value, email provider config, polling toggle
- `packages/backend/src/modules/settings/faq.schema.ts` - FAQ question/answer with tags
- `packages/backend/src/modules/agent/agent.schema.ts` - Conversation and guest context params
- `packages/backend/src/modules/calendar/calendar.schema.ts` - CalDAV config body (serverUrl, username, calendarName)
- `packages/backend/src/modules/assistant/assistant.schema.ts` - Chat message and session key
- `packages/backend/src/modules/auth/auth.routes.ts` - 400/401 on login, 401 on /me
- `packages/backend/src/modules/agent/agent.routes.ts` - 404 on conversation/guest context
- `packages/backend/src/modules/calendar/calendar.routes.ts` - 400 on CalDAV config save
- `packages/backend/src/modules/dashboard/dashboard.routes.ts` - 400 on stats/today endpoints
- `packages/backend/src/modules/settings/settings.routes.ts` - 400/404 on settings CRUD, test-connection
- `packages/backend/src/modules/settings/faq.routes.ts` - 400/404 on FAQ CRUD endpoints

## Decisions Made
- Error response schemas could only be added to routes with existing success response blocks (6 of 13 modules). The fastify-type-provider-zod library infers error-only response blocks as the handler return type, causing TypeScript errors when the handler actually returns success data. This is a known limitation of the Zod type provider approach.
- Dashboard and invoice schemas were not enriched: dashboard has response-only schemas (no request fields to annotate), invoices are a Phase 2 placeholder with empty exports.
- `.openapi()` annotations placed only on request schemas per plan guidance, avoiding response schemas where Prisma Date objects could cause serialization issues.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Scoped error responses to routes with success response blocks only**
- **Found during:** Task 2 (Add error response schemas)
- **Issue:** Adding `response: { 400: errorResponseSchema }` to routes without existing success response schemas caused fastify-type-provider-zod to infer the handler return type as the error schema shape, breaking all return statements
- **Fix:** Only added error response codes alongside existing success response codes (e.g., `response: { 200: loginResponseSchema, 400: errorResponseSchema }`). Routes without success response schemas (guests, bookings, events, rooms, inbox, assistant) were left without error response blocks.
- **Files modified:** All 13 route files (6 received error responses, 7 reverted to original)
- **Verification:** `tsc --noEmit` passes cleanly
- **Committed in:** 3779f4e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Error responses added to 6 of 13 modules (those with existing success response blocks). Remaining 7 modules would need success response schemas added first, which is out of scope for this documentation-focused plan.

## Issues Encountered
- fastify-type-provider-zod treats response schemas as a union for handler return type inference. When only error codes are defined (no success code), the handler is constrained to return only error shapes. This is expected behavior but limits where error schemas can be placed without also defining success schemas.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Swagger documentation work for Phase 11 is complete
- Plans 03 and 04 (ARCHITECTURE.md files) are already complete per STATE.md
- The 7 modules without error response schemas could be enhanced in a future plan by first adding success response schemas

## Self-Check: PASSED

All 18 modified files verified present. Both task commits (95cb6f5, 3779f4e) verified in git log.

---
*Phase: 11-documentation-ota-alert-fix*
*Completed: 2026-02-23*
