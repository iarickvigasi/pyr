---
name: pyr-events
description: Look up upcoming events and registrations from the PYR system
---

## Event Lookup

To find upcoming events, capacity, and registrations:

**Upcoming events:** `GET ${PYR_API_URL}/api/v1/agent/events`
**Auth:** `X-API-Key: ${PYR_API_KEY}`
**Response:** Events for the next 30 days with title, type, date, time, capacity, registered count, and remaining slots.

Event types: puppy_yoga, beach_walk, coffee_cake_cuddles, retreat.
