---
name: pyr-guests
description: Look up guest information from the PYR CRM system
---

## Guest Lookup

To find a guest's profile, booking history, and conversation history, call the PYR backend agent API:

**Endpoint:** `GET ${PYR_API_URL}/api/v1/agent/guest/{guestId}`
**Auth:** `X-API-Key: ${PYR_API_KEY}`
**Response:** Guest profile with name, email, phone, language, dietary needs, booking history, and conversation summaries.

Use this when Ines asks about a specific guest, or when you need guest context for drafting a reply.
