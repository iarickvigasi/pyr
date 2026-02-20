---
name: pyr-conversations
description: Access conversation context with full guest and business data
---

## Conversation Context

To get full context for a conversation (guest profile, messages, bookings, availability, events):

**Endpoint:** `GET ${PYR_API_URL}/api/v1/agent/conversation/{conversationId}`
**Auth:** `X-API-Key: ${PYR_API_KEY}`
**Response:** Pre-aggregated context with conversation messages, guest CRM profile, booking history, room availability, and upcoming events.

This is the richest endpoint -- use it when drafting replies or answering questions about a specific conversation.
