# Tools & Environment

## PYR Backend API

The PYR business assistant plugin connects to the PYR backend REST API to query and manage business data. The plugin is loaded automatically by the OpenClaw Gateway on startup. It provides 40 tools across 10 categories: read queries, write actions with confirmation, payment management, and draft management.

**Connection:** The plugin reads `PYR_API_URL` and `PYR_API_KEY` from environment variables. In Docker, these are injected via the Gateway container's environment config.

**Authentication:** All API calls use the `X-API-Key` header with the configured API key. This is the same API key pattern used by the backend's assistant auth flow.

## Available Tool Categories

### Guests (7 tools)
- `search_guests` -- Search by name, email, or phone
- `get_guest` -- Full profile with booking history and conversations
- `list_guests` -- Browse recent guests
- `prepare_create_guest` -- Create a new guest profile (two-step confirmation)
- `prepare_update_guest` -- Update guest fields with before/after diff (two-step confirmation)
- `prepare_delete_guest` -- Archive (soft-delete) a guest (two-step confirmation)
- `prepare_merge_guests` -- Merge two duplicate guest records (two-step confirmation)

### Bookings (4 tools)
- `list_bookings` -- Filter by status, date range. Includes payment status and all guest names per booking
- `get_booking` -- Full booking detail with all guests, room info, payment summary, and notes
- `prepare_update_booking` -- Update booking fields with before/after diff (two-step confirmation)
- `prepare_cancel_booking` -- Cancel a booking with summary and warning (two-step confirmation)

### Payments (2 tools)
- `get_payment_status` -- Payment balance for a booking: total price, amount paid, balance due, payment history
- `prepare_log_payment` -- Log a payment against a booking with amount in EUR, method, and optional date/notes (two-step confirmation)

### Rooms (3 tools)
- `list_rooms` -- All rooms with status and type
- `list_room_types` -- Room categories with pricing
- `check_availability` -- Available rooms for a date range

### Events (6 tools)
- `list_events` -- Scheduled events with capacity info
- `get_event` -- Event details
- `list_event_registrations` -- Guests registered for an event
- `prepare_update_event` -- Update event fields with before/after diff (two-step confirmation)
- `prepare_delete_event` -- Delete an event permanently with warning (two-step confirmation)
- `prepare_register_guest` -- Register a guest for an event with capacity check (two-step confirmation)

### Conversations (3 tools)
- `list_conversations` -- Email inbox, filterable by status
- `get_conversation` -- Full message thread
- `update_conversation` -- Update conversation status or classification (direct execution, no confirmation)

### Dashboard (2 tools)
- `get_dashboard_stats` -- Business KPIs (revenue, bookings, inquiries)
- `get_today_schedule` -- Today's check-ins, check-outs, events

### Settings (2 tools)
- `get_settings` -- Non-sensitive application settings
- `update_setting` -- Update safe settings like business_name, timezone, email_signature, ai_model, briefing_time (direct execution, no confirmation)

### Actions (6 tools)
- `prepare_create_booking` -- Search guest(s) by name (supports multiple comma-separated names), check availability, calculate price, return summary for confirmation
- `prepare_create_event` -- Validate event type, return summary for confirmation
- `confirm_action` -- Execute a previously prepared action after Ines confirms
- `cancel_action` -- Cancel a previously prepared action when Ines rejects
- `send_invoice_reminder` -- List overdue bookings (unpaid or partially paid) with payment status for follow-up
- `update_briefing_time` -- Change the morning briefing delivery time (stored in settings)

### Drafts (5 tools)
- `list_pending_drafts` -- Show AI email drafts awaiting approval across conversations
- `show_draft` -- Display the full email draft (To, Subject, Body) for review
- `approve_draft` -- Queue draft for sending (goes through confirmation flow)
- `regenerate_draft` -- Discard current draft and generate a fresh replacement (no confirmation needed)
- `reject_draft` -- Discard a draft immediately (no confirmation needed)

## Confirmation Flow

All write actions use a two-step confirmation pattern. This is a core business rule -- never skip it.

1. **Prepare step**: The prepare tool validates inputs (checks guest exists, room available, etc.) and returns a structured summary with an `actionId`.
2. **Present**: Show the summary as a structured table and ask Ines: "Reply OK to confirm or Cancel to reject."
3. **Confirm step**: When Ines says OK/yes/go ahead, call `confirm_action` with the `actionId` to execute.
4. **Cancel step**: When Ines says cancel/no/stop, call `cancel_action` with the `actionId`. Simply acknowledge "Got it, cancelled." -- no follow-up prompts.

Draft approvals also follow this pattern: `approve_draft` stores a pending action, and `confirm_action` sends the email.

**Direct execution tools** (no confirmation): `update_conversation`, `update_setting`, `update_briefing_time`, `reject_draft`, `regenerate_draft`. These are reversible or non-critical.

## Limitations

- **Result cap:** List tools return a maximum of 20 items per request to avoid blowing up the context window. Use filters to narrow results.
- **Pre-formatted:** Dates, amounts, and enum values are pre-formatted in tool responses. Dates appear as "15 Mar 2026", amounts as "EUR 450.00", statuses as "Confirmed" instead of "confirmed".
- **Dashboard URLs:** Every entity in tool responses includes a `dashboardUrl` field (e.g., `/guests/abc123`). Include these as links in WebChat responses. Skip them in WhatsApp.
- **Payment logging:** Payments can be logged via the `prepare_log_payment` tool. The tool accepts amounts in EUR (not cents) and converts internally. Supported methods: bank_transfer, cash.

## Session Management

- **Dashboard sessions:** Use `dashboard:<timestamp>` as the session key. Each "New conversation" click generates a fresh key.
- **WhatsApp sessions:** Managed natively by OpenClaw per DM. No manual session key needed.
- Sessions are independent -- dashboard and WhatsApp conversations do not share context.
- Pending actions are stored per Gateway instance (in-memory). If the Gateway restarts, pending actions are cleared -- Ines can re-request any action.
