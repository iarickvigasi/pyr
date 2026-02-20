# Phase 6: CalDAV Calendar Sync - Research

**Researched:** 2026-02-20
**Domain:** CalDAV protocol / iCloud Calendar integration / iCalendar (RFC 5545) event generation
**Confidence:** HIGH

## Summary

CalDAV calendar sync is a well-understood domain with mature TypeScript tooling. The implementation requires two libraries: **tsdav** (CalDAV client that handles the HTTP/XML protocol layer) and **ical-generator** (builds RFC 5545-compliant VEVENT payloads). iCloud's CalDAV server at `caldav.icloud.com` supports all needed operations (PUT for create/update, DELETE for removal) with Basic auth using app-specific passwords. The existing codebase already has comprehensive scaffolding: a `CalendarEvent` Prisma model, `CalendarSyncJobData` job type, BullMQ queue with 5-retry exponential backoff, a placeholder job processor, a `CalendarModuleContract` interface, CalDAV env vars (`CALDAV_URL`, `CALDAV_USER`, `CALDAV_PASS`), and a caldav service module stub. The main implementation work is: (1) building the CalDAV client wrapper with tsdav, (2) generating iCalendar payloads per the user's format decisions, (3) wiring the job processor to handle create/update/delete operations, (4) hooking into booking and event mutations to enqueue sync jobs, (5) adding the CalDAV settings UI tab and failed-sync notification, and (6) integration testing with a real iCloud account.

**Primary recommendation:** Use tsdav v2.1.8 + ical-generator v10.x. Store CalDAV credentials in the Settings table (encrypted, like email credentials). Implement the CalDAV service as a thin wrapper around tsdav with iCalendar generation via ical-generator. Wire sync triggers into existing booking/event service functions by enqueuing BullMQ jobs after mutations.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Booking calendar title:** `Guest Name -- Room Name` (e.g. "Anna Schmidt -- Sea View Suite")
- **Booking description:** guest contact (email/phone), room assignment, payment status (total price + whether paid), booking source
- **Dietary needs excluded** from calendar description
- **Location field:** always populated with villa address for bookings
- **Standalone event title:** `Event Type (X/Y booked)` (e.g. "Puppy Yoga (6/8 booked)")
- **Event title is live-updated** -- registration count refreshes on each change
- **Event description:** full list of registered guest names
- **Event location:** specific location (Rooftop, Beach, etc.)
- **Single calendar** named "Puppy Yoga Retreat" -- all bookings and events together
- **Sync immediately** on every change via BullMQ background job
- **Retry on failure:** 3-5 attempts with increasing delay, then mark as failed
- **Failed syncs:** warning badge/notification in admin dashboard
- **Manual re-sync all button** in dashboard (settings or calendar page)
- **Bookings as all-day events** spanning full stay, includes check-out day
- **Standalone events as timed events** at their scheduled time
- **Cancellation:** NOT deleted from calendar, title prefixed with `[CANCELLED]`

### Claude's Discretion
- ETag handling strategy for CalDAV conflict resolution
- Exact retry backoff intervals
- CalDAV library choice (tsdav or alternative)
- Dashboard notification UI design for failed syncs
- Re-sync button placement

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CAL-01 | System pushes booking events to Apple Calendar via CalDAV (one-way: DB -> Calendar) | tsdav `createCalendarObject` with ical-generator VEVENT payload; BullMQ job triggered on booking create |
| CAL-02 | System pushes standalone events to Apple Calendar via CalDAV | Same tsdav/ical-generator pattern with timed VEVENT (DTSTART/DTEND with time) instead of all-day DATE format |
| CAL-03 | Calendar events include guest name, room assignment, dietary info, arrival time in description | ical-generator `createEvent({ summary, description, location })` -- note: user decision overrides dietary info requirement (excluded per CONTEXT.md) |
| CAL-04 | When a booking is updated, the corresponding calendar event is automatically updated | tsdav `updateCalendarObject` with full VCALENDAR replacement (no PATCH support in iCloud); SEQUENCE incremented |
| CAL-05 | When a booking or event is cancelled, the corresponding calendar event is deleted | Per user decision: NOT deleted, title prefixed with `[CANCELLED]` via update operation instead |
| TEST-04 | CalDAV sync tested with real iCloud account (create, update, delete events) | Integration test with real iCloud credentials; tsdav is end-to-end tested with Apple Cloud per their docs |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tsdav | ^2.1.8 | CalDAV protocol client (PROPFIND, PUT, DELETE) | 36K weekly downloads, end-to-end tested with Apple & Google, actively maintained (last release Feb 2026), used by Cal.com fork |
| ical-generator | ^10.0.0 | Generates RFC 5545-compliant iCalendar VEVENT payloads | TypeScript-native, supports all-day events, timed events, SEQUENCE, UID, VTIMEZONE, widely recommended alongside tsdav |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| uuid | (already in Node crypto) | Generate stable CalDAV UIDs | Use `crypto.randomUUID()` for new events; store as `caldavUid` in CalendarEvent model |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tsdav | ts-caldav | ts-caldav has built-in event creation (no need for ical-generator), but lower adoption (21 GitHub stars vs tsdav's ecosystem). tsdav is battle-tested at Cal.com scale |
| ical-generator | ics (adamgibbons) | ics is simpler but less feature-rich; ical-generator has full TypeScript types, all-day support, SEQUENCE tracking, VTIMEZONE embedding |
| Manual HTTP/XML | tsdav | CalDAV involves PROPFIND XML parsing, multipart WebDAV responses, Basic auth flow -- hand-rolling this is a week of work vs 1 day with tsdav |

**Installation:**
```bash
cd packages/backend && pnpm add tsdav ical-generator
```

## Architecture Patterns

### Recommended Project Structure
```
packages/backend/src/
├── services/
│   └── caldav/
│       ├── index.ts              # CalDAV module (implements CalendarModuleContract)
│       ├── caldav.service.ts     # Core CalDAV operations (connect, create, update, delete)
│       ├── caldav.client.ts      # tsdav client wrapper (lazy init, connection management)
│       └── ical-builder.ts       # iCalendar payload builders (booking VEVENT, event VEVENT)
├── services/queue/jobs/
│   └── calendar-sync.job.ts      # BullMQ job processor (replace placeholder)
├── modules/calendar/
│   └── calendar.routes.ts        # POST /calendar/sync (manual re-sync), GET /calendar/status
└── ...existing modules (bookings, events modified to enqueue sync jobs)
```

### Pattern 1: CalDAV Client Wrapper (Lazy Initialization)
**What:** Wrap tsdav's DAVClient in a service that lazily connects on first use and caches the connection. Reads CalDAV credentials from Settings table (same pattern as email credentials).
**When to use:** Every CalDAV operation -- the wrapper handles credential loading, client creation, calendar discovery, and reconnection.
**Example:**
```typescript
// caldav.client.ts
import { DAVClient } from 'tsdav';
import type { DAVCalendar } from 'tsdav';
import type { PrismaClient } from '@prisma/client';

interface CaldavConfig {
  serverUrl: string;
  username: string;
  password: string;
  calendarName: string;
}

let cachedClient: DAVClient | null = null;
let cachedCalendar: DAVCalendar | null = null;

export async function getCaldavConfig(prisma: PrismaClient): Promise<CaldavConfig> {
  // Load from Settings table (encrypted) -- same pattern as email config
  // Fallback to env vars for backward compat
}

export async function getCaldavClient(prisma: PrismaClient): Promise<{
  client: DAVClient;
  calendar: DAVCalendar;
}> {
  if (cachedClient && cachedCalendar) {
    return { client: cachedClient, calendar: cachedCalendar };
  }

  const config = await getCaldavConfig(prisma);
  const client = new DAVClient({
    serverUrl: config.serverUrl,
    credentials: {
      username: config.username,
      password: config.password,
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });

  await client.login();
  const calendars = await client.fetchCalendars();
  const calendar = calendars.find(c => c.displayName === config.calendarName);

  if (!calendar) {
    throw new Error(`Calendar "${config.calendarName}" not found on iCloud`);
  }

  cachedClient = client;
  cachedCalendar = calendar;
  return { client, calendar };
}

export function resetCaldavClient(): void {
  cachedClient = null;
  cachedCalendar = null;
}
```

### Pattern 2: iCalendar Payload Builder
**What:** Separate module that builds VEVENT payloads from booking/event data using ical-generator.
**When to use:** Every create/update operation. Centralizes the format decisions from CONTEXT.md.
**Example:**
```typescript
// ical-builder.ts
import ical from 'ical-generator';
import type { ICalCalendar, ICalEvent } from 'ical-generator';

const VILLA_ADDRESS = 'Puppy Yoga Retreat, Peyia 8560, Paphos, Cyprus';
const PRODID = '-//Puppy Yoga Retreat//PYR Calendar Sync//EN';

export function buildBookingVevent(params: {
  uid: string;
  guestName: string;
  roomName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  totalPrice: number; // cents
  paymentStatus: string; // 'Paid' | 'Unpaid' | 'Partial'
  bookingSource: string | null;
  checkIn: Date;
  checkOut: Date;
  isCancelled: boolean;
  sequence: number;
}): string {
  const cal = ical({ prodId: PRODID });
  const title = params.isCancelled
    ? `[CANCELLED] ${params.guestName} — ${params.roomName}`
    : `${params.guestName} — ${params.roomName}`;

  const descLines: string[] = [];
  if (params.guestEmail) descLines.push(`Email: ${params.guestEmail}`);
  if (params.guestPhone) descLines.push(`Phone: ${params.guestPhone}`);
  descLines.push(`Room: ${params.roomName}`);
  descLines.push(`Total: €${(params.totalPrice / 100).toFixed(2)} (${params.paymentStatus})`);
  if (params.bookingSource) descLines.push(`Source: ${params.bookingSource}`);

  const event = cal.createEvent({
    id: params.uid,
    summary: title,
    description: descLines.join('\n'),
    location: VILLA_ADDRESS,
    start: params.checkIn,
    end: params.checkOut,  // DTEND is non-inclusive in iCal, so check-out date is correct
    allDay: true,
    sequence: params.sequence,
  });

  return cal.toString();
}

export function buildEventVevent(params: {
  uid: string;
  eventType: string;
  confirmedCount: number;
  capacity: number;
  registeredGuests: string[];
  location: string | null;
  date: Date;
  time: string; // "HH:MM"
  durationMinutes: number;
  isCancelled: boolean;
  sequence: number;
}): string {
  const cal = ical({ prodId: PRODID });
  const titleType = formatEventType(params.eventType);
  const title = params.isCancelled
    ? `[CANCELLED] ${titleType} (${params.confirmedCount}/${params.capacity} booked)`
    : `${titleType} (${params.confirmedCount}/${params.capacity} booked)`;

  const description = params.registeredGuests.length > 0
    ? `Registered guests:\n${params.registeredGuests.map(n => `- ${n}`).join('\n')}`
    : 'No registrations yet';

  const [hours, minutes] = params.time.split(':').map(Number);
  const start = new Date(params.date);
  start.setHours(hours, minutes, 0, 0);
  const end = new Date(start.getTime() + params.durationMinutes * 60_000);

  cal.createEvent({
    id: params.uid,
    summary: title,
    description,
    location: params.location ?? undefined,
    start,
    end,
    sequence: params.sequence,
  });

  return cal.toString();
}
```

### Pattern 3: Sync Job Enqueueing from Services
**What:** After booking/event mutations, enqueue a CalDAV sync job via BullMQ.
**When to use:** In booking.service.ts (createBooking, updateBooking, cancelBooking) and event.service.ts (createEvent, updateEvent, deleteEvent, registerGuest).
**Example:**
```typescript
// In booking.service.ts after successful create:
const calendarSyncQueue = app.queues?.getQueue(QUEUE_NAMES.CALENDAR_SYNC);
if (calendarSyncQueue) {
  await calendarSyncQueue.add('calendar-sync', {
    entityType: 'booking',
    entityId: booking.id,
    action: 'create',
  } satisfies CalendarSyncJobData);
}
```
**Note:** This follows the same pattern as AI draft enqueueing in `email/index.ts` and `conversation.service.ts`. Wrap in try/catch so sync failures never block the primary operation.

### Pattern 4: CalDAV Schema Additions
**What:** Extend the CalendarEvent model to track ETag and sync status for proper CalDAV operations.
**When to use:** Prisma migration before implementing the service.
**Example:**
```prisma
model CalendarEvent {
  id         String    @id @default(cuid())
  bookingId  String?   @map("booking_id")
  eventId    String?   @map("event_id")
  caldavUid  String?   @map("caldav_uid")
  caldavUrl  String?   @map("caldav_url")      // Full URL for PUT/DELETE operations
  etag       String?                            // For conditional updates (If-Match)
  syncStatus String    @default("pending") @map("sync_status") // pending, synced, failed
  lastError  String?   @map("last_error")       // Last sync error message
  sequence   Int       @default(0)              // VEVENT SEQUENCE number
  lastSynced DateTime? @map("last_synced") @db.Timestamptz(3)
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt  DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)

  booking Booking? @relation(fields: [bookingId], references: [id], onDelete: SetNull)
  event   Event?   @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@index([bookingId])
  @@index([eventId])
  @@index([syncStatus])
  @@map("calendar_events")
}
```

### Anti-Patterns to Avoid
- **Sync inside the transaction:** Never perform CalDAV HTTP calls inside a Prisma `$transaction`. The transaction should complete immediately; the sync is a background job.
- **Reading from CalDAV to update DB:** Data flows ONE WAY (DB -> Calendar). Never fetch from iCloud to update the PYR database.
- **Hardcoding credentials in env vars only:** Follow the email pattern -- store CalDAV credentials in the Settings table (encrypted) with env var fallback, so Ines can update them from the admin UI.
- **Creating new CalDAV client per request:** iCloud requires PROPFIND discovery (principal URL, calendar-home-set) on each connection. Cache the client and calendar reference; reset on auth failure.
- **Deleting calendar events on cancellation:** User explicitly decided cancelled events should remain in the calendar with `[CANCELLED]` prefix.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CalDAV protocol (PROPFIND, PUT, DELETE, XML parsing) | Custom HTTP/XML client | tsdav | CalDAV involves complex multi-step discovery (principal -> calendar-home-set -> calendars), XML namespaced responses, WebDAV extensions. tsdav abstracts this to 5-6 function calls |
| iCalendar file generation | Manual VCALENDAR string building | ical-generator | RFC 5545 has many edge cases: timezone embedding (VTIMEZONE), all-day DATE vs datetime formats, SEQUENCE tracking, PRODID requirements, multiline folding at 75 chars. ical-generator handles all of this |
| CalDAV authentication flow with iCloud | Manual Basic auth + discovery | tsdav's `DAVClient.login()` | iCloud redirects to a per-user server (e.g., `p34-caldav.icloud.com`) during discovery. tsdav handles this transparently |
| ETag-based conflict detection | Manual If-Match header management | tsdav's `updateCalendarObject` | tsdav optionally includes If-Match headers and handles the 412 Precondition Failed response |

**Key insight:** CalDAV is a 4-layer protocol stack (HTTP -> WebDAV -> CalDAV -> iCalendar). Each layer has RFC-specified behaviors. Hand-rolling any layer means weeks of work and subtle bugs. The two-library approach (tsdav for layers 1-3, ical-generator for layer 4) is the established pattern.

## Common Pitfalls

### Pitfall 1: iCloud Server Discovery URL
**What goes wrong:** Connecting directly to `caldav.icloud.com` for data operations returns 301/404. The initial URL is only for discovery; actual operations use a per-user server like `p34-caldav.icloud.com`.
**Why it happens:** iCloud's CalDAV infrastructure is sharded across multiple servers. The discovery endpoint redirects to the correct shard.
**How to avoid:** Use tsdav's `DAVClient.login()` which handles the discovery process automatically. After login, `fetchCalendars()` returns calendars with the correct shard URL.
**Warning signs:** 301 redirects, "calendar not found" errors despite correct credentials.

### Pitfall 2: All-Day Event DTEND Is Non-Inclusive
**What goes wrong:** A booking from Jan 15 to Jan 18 shows as ending on Jan 17 in Apple Calendar.
**Why it happens:** Per RFC 5545, `DTEND;VALUE=DATE:20260118` means the event ends at the START of Jan 18, so it only shows through Jan 17.
**How to avoid:** For a booking that includes the check-out day (per user decision), set DTEND to checkout date + 1 day. ical-generator handles this correctly when `allDay: true` is set and `end` is the check-out date -- but verify this in testing.
**Warning signs:** Events appearing one day shorter than expected.

### Pitfall 3: No PATCH Support in iCloud
**What goes wrong:** Attempting to partially update an event property returns 405 Method Not Allowed.
**Why it happens:** iCloud CalDAV only supports full document replacement via PUT. There is no PATCH method.
**How to avoid:** Always rebuild the entire VCALENDAR payload from current DB data and send it as a full replacement via `updateCalendarObject`. Increment the SEQUENCE number on each update.
**Warning signs:** 405 errors on update attempts.

### Pitfall 4: Stale CalDAV Client After Credential Change
**What goes wrong:** After Ines updates CalDAV credentials in settings, sync operations continue using the old cached client.
**Why it happens:** The DAVClient is cached for performance. Credential changes in the Settings table don't invalidate the cache.
**How to avoid:** Call `resetCaldavClient()` whenever CalDAV settings are updated. Same pattern as the SMTP service lazy recreation on config change.
**Warning signs:** 401 errors after credential update.

### Pitfall 5: Duplicate CalDAV Events
**What goes wrong:** A booking gets two calendar events in Apple Calendar.
**Why it happens:** If createCalendarObject succeeds but the DB update (storing caldavUid/caldavUrl) fails, a retry creates a second event. Or: tsdav issue #138 reports duplicate events when using delete + re-create.
**How to avoid:** Use a deterministic UID derived from the CalendarEvent ID (e.g., `pyr-booking-{calendarEventId}`). Before creating, check if a CalendarEvent record already has a caldavUid; if so, update instead.
**Warning signs:** Multiple identical events appearing in Apple Calendar.

### Pitfall 6: App-Specific Password Required
**What goes wrong:** iCloud rejects Basic auth with the Apple ID password.
**Why it happens:** iCloud requires an app-specific password (generated at appleid.apple.com) for third-party CalDAV access, not the actual Apple ID password.
**How to avoid:** Document this clearly in the CalDAV settings UI. Add a help link to Apple's app-specific password page. Test connection before saving credentials.
**Warning signs:** 401 Unauthorized despite correct Apple ID email.

### Pitfall 7: Event Registration Count Staleness
**What goes wrong:** Calendar event title shows wrong registration count after concurrent registrations.
**Why it happens:** Two registrations happen simultaneously; both read count=5, both write "6/8 booked" to calendar.
**How to avoid:** The BullMQ job processor reads the CURRENT count from DB at sync time, not from the job payload. Since the calendar-sync queue has concurrency 1, jobs are sequential.
**Warning signs:** Count in calendar title doesn't match actual registration count.

## Code Examples

Verified patterns from official sources:

### Complete CalDAV Create Flow
```typescript
// Source: tsdav docs + ical-generator docs
import { DAVClient } from 'tsdav';
import ical from 'ical-generator';

// 1. Connect to iCloud
const client = new DAVClient({
  serverUrl: 'https://caldav.icloud.com',
  credentials: {
    username: 'user@icloud.com',
    password: 'xxxx-xxxx-xxxx-xxxx', // App-specific password
  },
  authMethod: 'Basic',
  defaultAccountType: 'caldav',
});
await client.login();

// 2. Find the target calendar
const calendars = await client.fetchCalendars();
const targetCalendar = calendars.find(c => c.displayName === 'Puppy Yoga Retreat');

// 3. Build iCalendar payload
const cal = ical({ prodId: '-//PYR//Calendar Sync//EN' });
const uid = crypto.randomUUID();
cal.createEvent({
  id: uid,
  summary: 'Anna Schmidt — Sea View Suite',
  description: 'Email: anna@example.com\nRoom: Sea View Suite\nTotal: €1,200.00 (Unpaid)\nSource: Direct',
  location: 'Puppy Yoga Retreat, Peyia 8560, Paphos, Cyprus',
  start: new Date('2026-03-15'),
  end: new Date('2026-03-19'),  // Check-out day (non-inclusive = shows through Mar 18)
  allDay: true,
  sequence: 0,
});

// 4. Push to iCloud
const response = await client.createCalendarObject({
  calendar: targetCalendar,
  filename: `${uid}.ics`,
  iCalString: cal.toString(),
});
```

### Complete CalDAV Update Flow
```typescript
// Source: tsdav docs + iCloud CalDAV requirements
// Full replacement required -- no PATCH support

const cal = ical({ prodId: '-//PYR//Calendar Sync//EN' });
cal.createEvent({
  id: existingUid,  // Same UID as original
  summary: 'Anna Schmidt — Mountain View Room',  // Updated room
  description: 'Email: anna@example.com\nRoom: Mountain View Room\nTotal: €1,200.00 (Paid)\nSource: Direct',
  location: 'Puppy Yoga Retreat, Peyia 8560, Paphos, Cyprus',
  start: new Date('2026-03-15'),
  end: new Date('2026-03-19'),
  allDay: true,
  sequence: 1,  // Incremented from 0
});

await client.updateCalendarObject({
  calendarObject: {
    url: storedCaldavUrl,   // From CalendarEvent.caldavUrl
    data: cal.toString(),
    etag: storedEtag,       // From CalendarEvent.etag (optional)
  },
});
```

### Cancellation (Update, Not Delete)
```typescript
// Per user decision: prefix title with [CANCELLED], don't delete
const cal = ical({ prodId: '-//PYR//Calendar Sync//EN' });
cal.createEvent({
  id: existingUid,
  summary: '[CANCELLED] Anna Schmidt — Sea View Suite',
  description: 'Email: anna@example.com\nRoom: Sea View Suite\nTotal: €1,200.00 (Unpaid)\nSource: Direct',
  location: 'Puppy Yoga Retreat, Peyia 8560, Paphos, Cyprus',
  start: new Date('2026-03-15'),
  end: new Date('2026-03-19'),
  allDay: true,
  sequence: 2,  // Incremented again
});

await client.updateCalendarObject({
  calendarObject: {
    url: storedCaldavUrl,
    data: cal.toString(),
  },
});
```

### Standalone Event with Registration Count
```typescript
// Timed event with capacity tracking in title
const cal = ical({ prodId: '-//PYR//Calendar Sync//EN' });
const start = new Date('2026-03-16T09:00:00');
const end = new Date('2026-03-16T10:30:00');  // 90 minutes

cal.createEvent({
  id: uid,
  summary: 'Puppy Yoga (6/8 booked)',
  description: 'Registered guests:\n- Anna Schmidt\n- Max Mueller\n- Sarah Jones\n- Tom Brown\n- Lisa White\n- Mark Green',
  location: 'Rooftop',
  start,
  end,
  sequence: 0,
  timezone: 'Europe/Nicosia',
});
```

### Job Processor Pattern
```typescript
// calendar-sync.job.ts -- replaces placeholder
import type { Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import type { CalendarSyncJobData } from '@pyr/shared';

export function createCalendarSyncProcessor(app: FastifyInstance) {
  return async (job: Job<CalendarSyncJobData>): Promise<void> => {
    const { entityType, entityId, action } = job.data;
    app.log.info({ jobId: job.id, entityType, entityId, action }, 'Processing calendar sync');

    if (entityType === 'booking') {
      await syncBookingToCalendar(app, entityId, action);
    } else if (entityType === 'event') {
      await syncEventToCalendar(app, entityId, action);
    }
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual CalDAV XML (PROPFIND/REPORT) | tsdav library abstraction | 2020+ | Reduces CalDAV code from ~500 lines to ~50 |
| Hand-crafted VCALENDAR strings | ical-generator library | 2015+ | Eliminates RFC 5545 formatting bugs (line folding, escaping, timezone) |
| Password auth with iCloud | App-specific passwords | 2017 (Apple 2FA) | Must generate app-specific password at appleid.apple.com |
| tsdav v1.x (class-only) | tsdav v2.x (function-based + class) | 2023 | Both approaches work; class-based with `login()` is cleaner for persistent connections |
| ETag always required | ETag optional in tsdav v2.0.8+ | 2023 | Some servers reject If-Match headers; tsdav now lets you skip etag |

**Deprecated/outdated:**
- tsdav v1.x API: Still works but v2.x is recommended (v2.1.8 is current)
- CalDAV server URL `contacts.icloud.com`: This is for CardDAV (contacts), not CalDAV. Use `caldav.icloud.com` for calendars

## Open Questions

1. **All-day event end date handling with ical-generator**
   - What we know: RFC 5545 DTEND is non-inclusive for DATE values. User wants check-out day included in the event span.
   - What's unclear: Does ical-generator's `allDay: true` with `end: checkOutDate` produce DTEND=checkOutDate (event shows through day before) or DTEND=checkOutDate+1 (event shows through checkOutDate)?
   - Recommendation: Test empirically with a real iCloud account in the first implementation task. If ical-generator produces DTEND=checkOutDate, add +1 day to the end date.

2. **Timezone handling for timed standalone events**
   - What we know: The villa is in Europe/Nicosia timezone. Standalone events have times stored as "HH:MM" strings in the DB.
   - What's unclear: Whether ical-generator embeds VTIMEZONE automatically when `timezone: 'Europe/Nicosia'` is set, or if it needs explicit configuration.
   - Recommendation: Test with ical-generator's timezone parameter. If VTIMEZONE isn't embedded, use `cal.timezone('Europe/Nicosia')` at calendar level.

3. **CalDAV settings encryption**
   - What we know: Email credentials are encrypted in the Settings table using JWT_SECRET-derived key via scrypt (decision [03-02]).
   - What's unclear: Whether the exact same encryption utility is exported and reusable.
   - Recommendation: Reuse the same encryption pattern. The email settings tab already demonstrates the UX pattern.

4. **Event duration for standalone events**
   - What we know: The Event model has `time: String` (HH:MM) but no explicit duration field. Puppy Yoga is 90 minutes per CLAUDE.md.
   - What's unclear: Whether duration should be derived from event type or added to the Event model.
   - Recommendation: Use a type-to-duration mapping: `puppy_yoga: 90, beach_walk: 120, coffee_cake_cuddles: 60, retreat: 0 (not used for standalone)`. This avoids a schema migration for a CalDAV-only concern.

## Sources

### Primary (HIGH confidence)
- [tsdav official docs](https://tsdav.vercel.app/docs/intro) - Client setup, API methods, cloud provider config
- [tsdav npm](https://www.npmjs.com/package/tsdav) - v2.1.8, 36K weekly downloads
- [tsdav GitHub releases](https://github.com/natelindev/tsdav/releases) - v2.1.8 (Feb 2026), iCloud fix in v2.1.4
- [tsdav TypeScript definitions](https://app.unpkg.com/tsdav@2.0.3/files/dist/tsdav.d.ts) - createCalendarObject, updateCalendarObject, deleteCalendarObject signatures
- [ical-generator GitHub](https://github.com/sebbo2002/ical-generator) - v10.0.0, TypeScript-native, all-day event support
- [ical-generator ICalEvent API](https://sebbo2002.github.io/ical-generator/develop/reference/classes/ICalEvent.html) - Full method signatures

### Secondary (MEDIUM confidence)
- [OneCal iCloud CalDAV guide](https://www.onecal.io/blog/how-to-integrate-icloud-calendar-api-into-your-app) - Verified code patterns, iCloud-specific quirks
- [Aurinko CalDAV Apple guide](https://www.aurinko.io/blog/caldav-apple-calendar-integration/) - ETag handling, VTIMEZONE, all-day DATE format
- [RFC 5545 VEVENT spec](https://icalendar.org/iCalendar-RFC-5545/3-6-1-event-component.html) - DTEND non-inclusive behavior for DATE values
- [ts-caldav GitHub](https://github.com/KlautNet/ts-caldav) - Alternative library reference, iCloud support confirmed

### Tertiary (LOW confidence)
- [Cal.com CalDAV blog post](https://cal.com/blog/the-intricacies-and-challenges-of-implementing-a-caldav-supporting-system-for-cal) - Referenced but content not extractable (Framer-rendered SPA)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - tsdav and ical-generator are the established TypeScript CalDAV stack; multiple sources confirm
- Architecture: HIGH - Existing codebase has comprehensive scaffolding (model, job type, queue, contract, env vars); patterns are clear
- Pitfalls: HIGH - iCloud CalDAV quirks are well-documented; all-day DTEND behavior is per RFC 5545 spec
- Code examples: MEDIUM - createCalendarObject examples from docs; updateCalendarObject less documented, inferred from TypeScript types + WebDAV spec

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable domain, libraries on maintenance cadence)
