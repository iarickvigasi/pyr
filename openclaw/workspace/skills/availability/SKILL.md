---
name: pyr-availability
description: Check room availability and pricing from the PYR system
---

## Availability Check

To check room availability for the next 90 days:

**Endpoint:** `GET ${PYR_API_URL}/api/v1/agent/availability`
**Auth:** `X-API-Key: ${PYR_API_KEY}`
**Response:** Per room type: total rooms, booked rooms, available rooms, and date range.

Always check availability before quoting prices or confirming bookings. Never commit to pricing without verified data.
