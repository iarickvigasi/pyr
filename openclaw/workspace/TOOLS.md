# Tools & Environment

## PYR Backend API

The PYR business assistant plugin connects to the PYR backend REST API to query and manage business data. The plugin is loaded automatically by the OpenClaw Gateway on startup. It provides 26 tools across 9 categories: read queries, write actions with confirmation, and draft management.

**Connection:** The plugin reads `PYR_API_URL` and `PYR_API_KEY` from environment variables. In Docker, these are injected via the Gateway container's environment config.

**Authentication:** All API calls use the `X-API-Key` header with the configured API key. This is the same API key pattern used by the backend's assistant auth flow.

## Available Tool Categories

### Guests (3 tools)
- `search_guests` -- Search by name, email, or phone
- `get_guest` -- Full profile with booking history and conversations
- `list_guests` -- Browse recent guests

### Bookings (2 tools)
- `list_bookings` -- Filter by status, date range
- `get_booking` -- Full booking detail with guest and room info

### Rooms (3 tools)
- `list_rooms` -- All rooms with status and type
- `list_room_types` -- Room categories with pricing
- `check_availability` -- Available rooms for a date range

### Events (3 tools)
- `list_events` -- Scheduled events with capacity info
- `get_event` -- Event details
- `list_event_registrations` -- Guests registered for an event

### Conversations (2 tools)
- `list_conversations` -- Email inbox, filterable by status
- `get_conversation` -- Full message thread

### Dashboard (2 tools)
- `get_dashboard_stats` -- Business KPIs (revenue, bookings, inquiries)
- `get_today_schedule` -- Today's check-ins, check-outs, events

### Settings (1 tool)
- `get_settings` -- Non-sensitive application settings

### Actions (6 tools)
- `prepare_create_booking` -- Search guest, check availability, calculate price, return summary for confirmation
- `prepare_create_event` -- Validate event type, return summary for confirmation
- `confirm_action` -- Execute a previously prepared action after Ines confirms
- `cancel_action` -- Cancel a previously prepared action when Ines rejects
- `send_invoice_reminder` -- List overdue bookings or get specific booking details for follow-up
- `update_briefing_time` -- Change the morning briefing delivery time (stored in settings)

### Drafts (4 tools)
- `list_pending_drafts` -- Show AI email drafts awaiting approval across conversations
- `show_draft` -- Display the full email draft (To, Subject, Body) for review
- `approve_draft` -- Queue draft for sending (goes through confirmation flow)
- `reject_draft` -- Discard a draft immediately (no confirmation needed)

## Confirmation Flow

All write actions use a two-step confirmation pattern. This is a core business rule -- never skip it.

1. **Prepare step**: The prepare tool validates inputs (checks guest exists, room available, etc.) and returns a structured summary with an `actionId`.
2. **Present**: Show the summary as a structured table and ask Ines: "Reply OK to confirm or Cancel to reject."
3. **Confirm step**: When Ines says OK/yes/go ahead, call `confirm_action` with the `actionId` to execute.
4. **Cancel step**: When Ines says cancel/no/stop, call `cancel_action` with the `actionId`. Simply acknowledge "Got it, cancelled." -- no follow-up prompts.

Draft approvals also follow this pattern: `approve_draft` stores a pending action, and `confirm_action` sends the email.

## Limitations

- **Result cap:** List tools return a maximum of 20 items per request to avoid blowing up the context window. Use filters to narrow results.
- **Pre-formatted:** Dates, amounts, and enum values are pre-formatted in tool responses. Dates appear as "15 Mar 2026", amounts as "EUR 450.00", statuses as "Confirmed" instead of "confirmed".
- **Dashboard URLs:** Every entity in tool responses includes a `dashboardUrl` field (e.g., `/guests/abc123`). Include these as links in WebChat responses. Skip them in WhatsApp.
- **Invoice automation:** Full invoice/payment features are Phase 2. The `send_invoice_reminder` tool currently surfaces overdue booking information for manual follow-up.

## Session Management

- **Dashboard sessions:** Use `dashboard:<timestamp>` as the session key. Each "New conversation" click generates a fresh key.
- **WhatsApp sessions:** Managed natively by OpenClaw per DM. No manual session key needed.
- Sessions are independent -- dashboard and WhatsApp conversations do not share context.
- Pending actions are stored per Gateway instance (in-memory). If the Gateway restarts, pending actions are cleared -- Ines can re-request any action.
