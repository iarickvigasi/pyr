---
name: pyr-bookings
description: Look up booking details and manage payments from the PYR booking system
---

## Booking Lookup

To find booking details including guests, room, dates, status, and payment information:

**List bookings:** `GET ${PYR_API_URL}/api/v1/bookings?status={status}&limit=20`
**Single booking:** `GET ${PYR_API_URL}/api/v1/bookings/{bookingId}`
**Auth:** `X-API-Key: ${PYR_API_KEY}`

Booking statuses: inquiry, confirmed, checked_in, checked_out, cancelled.
Payment statuses: paid, partial, unpaid.
Prices are in EUR cents. Bookings can have multiple guests (bookingGuests array).

## Payment Tracking

**Payment summary** is included on booking detail responses: totalPrice, totalPaid, balanceDue (all in cents).
**Log a payment:** `POST ${PYR_API_URL}/api/v1/bookings/{bookingId}/payments` with body `{ amount, method, date?, notes? }`.
Supported methods: bank_transfer, cash. Amount is in EUR cents.
