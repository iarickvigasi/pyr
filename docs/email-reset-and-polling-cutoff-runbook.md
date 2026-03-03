# Email Reset And Polling Cutoff Runbook

Date: 2026-03-03

## Goal

Reset business data for a clean environment and enforce inbound email ingestion
to accept only emails from today onward.

## Code Changes

1. IMAP search now supports an optional minimum date filter (`since`):
   - `packages/backend/src/services/email/imap.service.ts`
2. Email pipeline now resolves and enforces a minimum poll date:
   - `packages/backend/src/services/email/index.ts`
   - Filter source precedence:
     1) `settings.key = email_poll_min_date`
     2) `EMAIL_POLL_MIN_DATE` env var
   - Supported values:
     - `today` (Europe/Nicosia business date)
     - `YYYY-MM-DD`
3. Added env template key:
   - `.env.example` -> `EMAIL_POLL_MIN_DATE=today`

## Runtime Configuration

Use either:

1. Settings table (`settings.key = email_poll_min_date`, value string), or
2. Env var `EMAIL_POLL_MIN_DATE`.

Recommended value for production operation:

```bash
EMAIL_POLL_MIN_DATE=today
```

## Data Cleanup Performed

### Deleted (full wipe)

- `attachments`
- `ai_drafts`
- `messages`
- `calendar_events`
- `payments`
- `invoices`
- `booking_guests`
- `bookings`
- `event_bookings`
- `events`
- `conversations`
- `guests`
- `rooms`
- `room_types`
- `seasons`
- `faqs`
- `audit_log`

### Preserved

- `admin_users` (login retained)
- `settings` (provider config retained)

### Additional Reset

- Removed `settings.key = imap_last_uid` to allow clean bootstrap under new date filter.
- Obliterated BullMQ queue histories:
  - `dead-letter`, `email-poll`, `ai-draft`, `calendar-sync`, `scheduled`, `health-check`

## Operational Commands (Reference)

The following command categories were used during reset:

1. Prisma cleanup scripts:
   - Delete business entities (guests, bookings, conversations, messages, attachments, etc.).
   - Keep `admin_users` and `settings`.
2. Settings updates:
   - Delete `imap_last_uid`.
   - Upsert `email_poll_min_date=today`.
3. Queue cleanup:
   - BullMQ `obliterate({ force: true })` per queue.

Run these only in environments where destructive cleanup is expected.

## Expected Behavior After Reset

1. Old business data is gone.
2. Polling may ingest new emails that are dated today or later.
3. Emails older than configured minimum date are skipped even if fetched.
4. Admin login remains functional.

## Verification Checklist

1. Backend health:
   - `GET /health` -> database/redis/gateway all `ok`.
2. Auth:
   - `POST /api/v1/auth/login` with admin account succeeds.
3. Polling filter:
   - Observe logs for `Skipping inbound email older than configured min poll date` when applicable.
4. Draft generation:
   - `POST /api/v1/conversations/:id/drafts/generate` returns `202` for valid conversation.
