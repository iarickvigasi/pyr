---
phase: 06-caldav-calendar-sync
plan: 01
subsystem: calendar
tags: [caldav, tsdav, ical-generator, icalendar, apple-calendar, prisma]

# Dependency graph
requires:
  - phase: 01-queue-module-foundation
    provides: BullMQ queue infrastructure and CalendarSyncJobData type
  - phase: 03-email-ui-ota-parsing
    provides: Encryption utility (lib/encryption.ts) and Settings table pattern for credential storage
provides:
  - Extended CalendarEvent Prisma model with caldavUrl, etag, syncStatus, lastError, sequence fields
  - CalDAV client wrapper with lazy singleton, Settings-based credential loading, env var fallback
  - iCalendar VEVENT builders for bookings (all-day) and events (timed) per CONTEXT.md format decisions
affects: [06-caldav-calendar-sync, calendar-sync-job-processor, booking-service, event-service]

# Tech tracking
tech-stack:
  added: [tsdav@^2.1.8, ical-generator@^10.0.0]
  patterns: [lazy-singleton-caldav-client, encrypted-settings-credential-loading, rfc5545-all-day-dtend-plus-one]

key-files:
  created:
    - packages/backend/src/services/caldav/caldav.client.ts
    - packages/backend/src/services/caldav/ical-builder.ts
    - packages/backend/prisma/migrations/20260220190000_add_caldav_tracking_fields/migration.sql
  modified:
    - packages/backend/prisma/schema.prisma
    - packages/shared/src/types/calendar.ts
    - packages/backend/package.json

key-decisions:
  - "CalDAV credentials stored in Settings table (encrypted, same pattern as email_provider) with env var fallback"
  - "All-day booking VEVENT end date = checkOut + 1 day per RFC 5545 non-inclusive DTEND rule"
  - "Event durations derived from type mapping (puppy_yoga: 90, beach_walk: 120, coffee_cake_cuddles: 60) rather than DB field"
  - "CalDAV client cached as lazy singleton with explicit resetCaldavClient() for credential changes"

patterns-established:
  - "CalDAV client lazy singleton: getCaldavClient(prisma) caches DAVClient + DAVCalendar, resetCaldavClient() invalidates on credential change"
  - "iCalendar builder pattern: buildBookingVevent/buildEventVevent take typed params and return VCALENDAR string via ical-generator"
  - "Event type display mapping: EVENT_TYPE_LABELS for human-readable names, EVENT_DURATIONS for timed event duration"

requirements-completed: [CAL-01, CAL-02, CAL-03]

# Metrics
duration: 5min
completed: 2026-02-20
---

# Phase 6 Plan 1: CalDAV Schema & Client Foundation Summary

**Extended CalendarEvent model with CalDAV tracking fields, tsdav client wrapper with iCloud auth, and iCalendar VEVENT builders for bookings (all-day) and events (timed)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-20T18:55:39Z
- **Completed:** 2026-02-20T19:01:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- CalendarEvent Prisma model extended with caldavUrl, etag, syncStatus, lastError, and sequence fields for full CalDAV operation tracking
- CalDAV client wrapper with lazy singleton pattern, encrypted credential loading from Settings table, and descriptive error messages for connection/calendar-not-found failures
- iCalendar builder producing RFC 5545-compliant VEVENTs for bookings (all-day with inclusive checkout) and standalone events (timed with type-based duration)

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration + dependencies + shared types** - `5f710ba` (feat)
2. **Task 2: CalDAV client wrapper and iCalendar payload builders** - `b193639` (feat)

## Files Created/Modified
- `packages/backend/prisma/schema.prisma` - Extended CalendarEvent model with caldavUrl, etag, syncStatus, lastError, sequence
- `packages/backend/prisma/migrations/20260220190000_add_caldav_tracking_fields/migration.sql` - Migration adding new columns and syncStatus index
- `packages/shared/src/types/calendar.ts` - Updated CalendarEvent interface with new fields
- `packages/backend/src/services/caldav/caldav.client.ts` - tsdav client wrapper with lazy init, credential loading, cache reset
- `packages/backend/src/services/caldav/ical-builder.ts` - VEVENT builders for bookings and events per CONTEXT.md format decisions
- `packages/backend/package.json` - Added tsdav and ical-generator dependencies

## Decisions Made
- CalDAV credentials follow same encrypted Settings pattern as email_provider (key: `caldav_provider`) with env var fallback for backward compatibility
- Booking all-day VEVENT end date set to checkOut + 1 day because RFC 5545 DTEND is non-inclusive for DATE values and user decided checkout day should be visible
- Event durations derived from type-to-minutes mapping rather than adding a DB field -- avoids schema migration for a CalDAV-only concern
- CalDAV client cached as lazy singleton (same lifecycle as email SMTP service) with explicit reset function for credential changes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- DATABASE_URL not set in dev environment so `prisma migrate dev` could not run -- created migration SQL manually (same approach as Phase 4 decision [04-01])

## User Setup Required

None - no external service configuration required for this plan. CalDAV credentials will be configured in a later plan via the admin settings UI.

## Next Phase Readiness
- CalDAV client and iCalendar builders ready for the sync job processor (Plan 2)
- Schema migration ready for deployment via `prisma migrate deploy`
- The existing caldav.service.ts stub and index.ts module contract are ready to be wired into the real implementation

---
*Phase: 06-caldav-calendar-sync*
*Completed: 2026-02-20*
