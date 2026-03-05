# Telegram Inbox Ops via OpenClaw

## Scope
- Owner receives inbound inbox alerts in Telegram DM (conversation + OTA).
- Owner can run inbox operations in natural language through OpenClaw tools.
- Mutating actions remain confirmation-gated (`prepare -> confirm_action`).

## Configuration

Set in `.env` (or settings table overrides):

```env
NOTIFY_TELEGRAM_ENABLED=true
NOTIFY_TELEGRAM_OWNER_USER_ID=130414078
NOTIFY_INBOX_SCOPE=conversation,ota
```

Notes:
- `NOTIFY_TELEGRAM_OWNER_USER_ID` is required for deterministic delivery.
- If unset, backend falls back to `TELEGRAM_ALLOWED_USER_ID`.
- `NOTIFY_INBOX_SCOPE` accepts `conversation`, `ota` (comma-separated).

Optional runtime settings (same keys) can override env:
- `notify_telegram_enabled`
- `notify_telegram_owner_user_id`
- `notify_inbox_scope`

## Delivery Architecture

1. Email ingestion classifies inbound email via OpenClaw.
2. If class is in scope (`conversation` or `ota`), backend enqueues `inbox-telegram-notify`.
3. Worker loads message data and formats a compact notification.
4. Notification service sends `agent` RPC with explicit target routing:
   - `replyChannel: "telegram"`
   - `replyTo: <owner_user_id>`
5. OpenClaw delivers to owner DM chat.

## Queue + Worker

- Queue name: `inbox-telegram-notify`
- Job payload:
  - `conversationId`
  - `messageId`
  - `classification`
- Deduplication:
  - Job id uses inbound RFC `Message-ID` when available (`inbox-telegram-notify:<sanitized-message-id>`).
  - Fallback to internal message row id.

## OpenClaw Plugin Tools Added

- `generate_conversation_draft`
  - Calls `POST /api/v1/conversations/:id/drafts/generate`.
- `analyze_conversation_booking`
  - Calls `POST /api/v1/conversations/:id/booking-analysis`.
- `create_conversation_booking` (prepare only)
  - Stores pending action.
  - Executes only after `confirm_action`.

`confirm_action` now supports `create_conversation_booking` execution:
- `POST /api/v1/conversations/:id/bookings`

## Operator Flow (Telegram)

1. Alert arrives with `conversationId`, sender, subject, snippet, inbox link.
2. Owner asks:
   - `show conversation <id>`
   - `generate draft for <id>`
   - `analyze booking for <id>`
3. For booking creation:
   - assistant prepares `create_conversation_booking`
   - owner sends `OK`
   - assistant runs `confirm_action`

## Failure Semantics

- If owner target missing: delivery is skipped (warn log), no crash.
- If OpenClaw/backend call fails: response explicitly states `No changes were applied.`
- Queue enqueue failures are non-blocking for email ingestion.

## Logs

Key log markers:
- `inbox_telegram_notify_started`
- `inbox_telegram_notify_completed`
- `inbox_telegram_notify_skipped_message_not_found`
- `Gateway agent request sent`
- `Gateway agent request failed`

Recommended fields to inspect:
- `conversationId`
- `messageId`
- `hookPath`
- queue `jobId`

## Troubleshooting

### No inbox notifications in Telegram
1. Check env/settings values for owner target and enabled flag.
2. Verify worker registered and queue exists:
   - queue name `inbox-telegram-notify`
3. Check backend logs for skipped delivery warnings.
4. Check OpenClaw gateway logs for delivery target errors.

### Error: "Delivering to Telegram requires target"
Cause:
- Missing `replyTo`/target routing in gateway request.

Fix:
- Ensure backend is running code with explicit `replyChannel` + `replyTo`.
- Ensure `NOTIFY_TELEGRAM_OWNER_USER_ID` is set.

### Draft/booking command failed from Telegram
1. Verify backend API is reachable (`http://localhost:3001`).
2. Retry after checking queue and gateway health.
3. Confirm expected safe behavior: no mutation if action failed.

## Verification Checklist

1. Ingest a new inbound conversation email.
2. Confirm Telegram DM alert arrives with conversation id and link.
3. Run `generate_conversation_draft <id>` and verify job accepted.
4. Approve/send flow still requires explicit confirmation.
5. Run booking analysis + prepared create + `OK` confirm.
6. Verify booking is created and linked to conversation.
