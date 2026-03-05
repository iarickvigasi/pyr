# Viator Event Automation (OpenClaw-Only)

## Scope

This flow automates **analysis** for Viator emails and keeps **all mutations manual** via Inbox wizard actions.

- Auto on ingest: run Viator event analysis in background.
- Manual in UI: apply `create_or_link`, `cancel`, `move`.
- No deterministic extraction fallback; OpenClaw is the only extractor.
- No automatic create/update/cancel writes during ingestion.

## Architecture

1. Inbound email arrives and is stored as conversation + message.
2. Classification is done by OpenClaw (`classifyEmailWithOpenClaw`).
3. For inbound sender domain ending with `viator.com`:
   - Upsert `conversation_event_analyses` row to `pending`.
   - Enqueue queue job `viator-event-analysis`.
4. Worker consumes `viator-event-analysis`:
   - Runs OpenClaw analyzer (`openclaw-viator-event-analyzer.ts`).
   - Persists final status for conversation:
     - `ready`, `insufficient_data`, `not_applicable`, `error`.
5. Inbox detail UI polls `GET /api/v1/conversations/:id/event-analysis`.
6. User opens wizard and applies action through `POST /api/v1/conversations/:id/events`.

## Data Model

### `event_bookings` additions

- `attendee_count INT DEFAULT 1`
- `external_provider TEXT NULL`
- `external_booking_id TEXT NULL`
- `external_product_code TEXT NULL`
- `source_conversation_id TEXT NULL` (FK to `conversations.id`)

Indexes/constraints:

- index on `source_conversation_id`
- index on (`external_provider`, `external_booking_id`)
- unique on (`external_provider`, `external_booking_id`)

### New table: `conversation_event_analyses`

Stores latest persisted analysis per conversation (unique `conversation_id`), including:

- status, reason, classification, intent
- missing fields
- candidate JSON and resolution JSON
- optional `message_id` link

## APIs

### 1) Get latest analysis

- `GET /api/v1/conversations/:id/event-analysis`
- Returns latest row or synthetic `pending` when not analyzed yet.

### 2) Run analysis now

- `POST /api/v1/conversations/:id/event-analysis`
- Synchronous rerun + persistence.

### 3) Apply event action

- `POST /api/v1/conversations/:id/events`
- Discriminated union `operation`:
  - `create_or_link`
  - `cancel`
  - `move`

## Capacity Rule (attendee-based)

Event capacity is validated using **sum of confirmed `attendeeCount`**, not registration row count.

- Confirm when: `confirmedAttendees + newAttendeeCount <= capacity`
- Otherwise: `waitlisted`

This is applied for direct event registration and move/create_or_link flows.

## Inbox UI

1. `EventAnalysisCard` shows current persisted state:
   - pending, ready, insufficient_data, not_applicable, error.
2. `InboxEventWizardDialog` supports:
   - operation select
   - guest resolve mode (`linked`, `existing`, `create`)
   - optional per-field guest updates
   - event target mode (`existing`, `create`)
   - registration details (`externalBookingId`, `externalProductCode`, `attendeeCount`)
3. Conversation header shows linked event links from `eventRegistrations` (source-linked registrations).

## Verification Checklist

1. Send Viator inbound email.
2. Confirm analysis row goes `pending -> final`.
3. Open Inbox conversation and verify Event Analysis card state.
4. Apply each operation from wizard:
   - create/link registration
   - cancel by external booking ID
   - move to target event
5. Confirm conversation header renders event link(s).
6. Confirm attendee-count impacts `confirmed` vs `waitlisted`.

## Troubleshooting

### Analysis stuck pending

- Check queue worker is running and `viator-event-analysis` queue is registered.
- Check logs for `viator_analysis_started|completed|failed`.

### Analysis returns error

- OpenClaw gateway unavailable/disconnected.
- OpenClaw returned invalid/malformed JSON.

### Cancel/move returns 404

- No registration exists for (`externalProvider = viator`, `externalBookingId = <value>`).

### Registration becomes waitlisted unexpectedly

- Target event capacity is checked using total confirmed attendees, not registration rows.

