---
name: pyr-bookings
description: Look up booking details from the PYR booking system
---

## Booking Lookup

To find booking details including guest, room, dates, and status:

**List bookings:** `GET ${PYR_API_URL}/api/v1/bookings?status={status}&limit=20`
**Single booking:** `GET ${PYR_API_URL}/api/v1/bookings/{bookingId}`
**Auth:** `X-API-Key: ${PYR_API_KEY}`

Booking statuses: inquiry, confirmed, checked_in, checked_out, cancelled. Prices are in EUR cents.
