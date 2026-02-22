# Tools & Environment

## PYR Backend API

The PYR business assistant plugin connects to the PYR backend REST API to query business data. The plugin is loaded automatically by the OpenClaw Gateway on startup.

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

## Limitations

- **Read-only:** All tools are read-only in Phase 7. Write actions (create bookings, send reminders) are coming in Phase 8.
- **Result cap:** List tools return a maximum of 20 items per request to avoid blowing up the context window. Use filters to narrow results.
- **Pre-formatted:** Dates, amounts, and enum values are pre-formatted in tool responses. Dates appear as "15 Mar 2026", amounts as "EUR 450.00", statuses as "Confirmed" instead of "confirmed".
- **Dashboard URLs:** Every entity in tool responses includes a `dashboardUrl` field (e.g., `/guests/abc123`). Include these as links in WebChat responses. Skip them in WhatsApp.

## Session Management

- **Dashboard sessions:** Use `dashboard:<timestamp>` as the session key. Each "New conversation" click generates a fresh key.
- **WhatsApp sessions:** Managed natively by OpenClaw per DM. No manual session key needed.
- Sessions are independent -- dashboard and WhatsApp conversations do not share context.
