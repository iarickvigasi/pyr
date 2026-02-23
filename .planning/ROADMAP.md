# Roadmap: Puppy Yoga Retreat — MVP Completion

## Overview

The existing PYR platform has a working database, REST API, CRM, and admin dashboard (E1-E3, E5 complete). This roadmap delivers the remaining MVP: email ingestion with AI-drafted replies, CalDAV calendar sync, and an AI assistant (OpenClaw) -- transforming the system from a data entry tool into Ines's fully automated business hub. The work flows from foundational infrastructure (queues, modules) through each integration pipeline (email, AI, calendar, assistant) to production launch. Each phase includes tests that verify its own functionality -- no separate testing phase.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Queue & Module Foundation** - BullMQ infrastructure and modular architecture patterns for all background workers (completed 2009-02-19)
- [x] **Phase 2: Email Ingestion Pipeline** - IMAP polling, parsing, threading, contact matching, classification, SMTP sending, and integration tests verifying the full pipeline (completed 2009-02-20)
- [x] **Phase 3: Email UI & OTA Parsing** - Wire live email data into inbox UI, email provider settings, and OTA booking email extraction (completed 2009-02-20)
- [x] **Phase 4: AI Communication Engine** - LLM abstraction layer, context-rich system prompts, message classification, and cost tracking (completed 2009-02-20)
- [x] **Phase 5: AI-Email Integration** - Auto-generate AI drafts on inbound emails, approve/edit/send workflow, FAQ management, and AI draft integration tests (completed 2009-02-20)
- [x] **Phase 6: CalDAV Calendar Sync** - One-way push of bookings and events to Apple Calendar via CalDAV, verified with real iCloud account tests (completed 2009-02-21)
- [x] **Phase 7: OpenClaw Assistant Core** - OpenClaw runtime setup, dashboard chat UI, WhatsApp channel, and read-only query tools (completed 2009-02-21)
- [x] **Phase 8: Assistant Actions & Automation** - Write actions with confirmation, morning briefings, proactive alerts, draft approval via chat (completed 2009-02-22)
- [x] **Phase 8.1: Integration Fixes & Verification Closure** - INSERTED: Fix OTA→calendar sync wiring, check_availability params, run retroactive verifiers on Phases 6 & 7, fix traceability (completed 2009-02-22)

## Phase Details

### Phase 1: Queue & Module Foundation
**Goal**: All background processing infrastructure is operational and every integration module follows a consistent, composable architecture
**Depends on**: Nothing (builds on existing E1/E2 infrastructure)
**Requirements**: ARCH-01, ARCH-02
**Success Criteria** (what must be TRUE):
  1. BullMQ workers can be registered, process jobs, and handle failures with retry logic -- verified by a health-check job running on schedule
  2. Each integration module (email, AI, calendar, assistant) has a clean Fastify plugin boundary with typed interfaces -- no cross-module imports except through defined contracts
  3. A new worker can be added by creating a single file and registering it -- the infrastructure handles connection pooling, graceful shutdown, and error isolation
**Plans**: 2 plans

Plans:
- [x] 01-01: BullMQ queue plugin, typed job payloads, worker registration, Bull Board, health-check job, graceful shutdown
- [x] 01-02: Module contract interfaces, integration plugin boundaries, Queues dashboard page with Bull Board embed

### Phase 2: Email Ingestion Pipeline
**Goal**: Inbound emails arrive in the system automatically -- parsed, threaded into conversations, and matched to CRM guests -- with automated tests proving the pipeline works end-to-end
**Depends on**: Phase 1
**Requirements**: EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04, EMAIL-05, EMAIL-06, EMAIL-07, TEST-01, TEST-03
**Success Criteria** (what must be TRUE):
  1. When someone emails puppyyogaretreat@gmx.de, the message appears in the conversations table within 3 minutes -- with sender, subject, and body correctly parsed
  2. Reply chains are threaded into a single conversation using In-Reply-To/References headers -- a 5-message back-and-forth shows as one conversation, not five
  3. Sender email is auto-matched to an existing CRM guest, or a new guest record is created if no match exists
  4. Incoming emails are classified as guest inquiry, OTA notification, spam/newsletter, or admin/system
  5. Outbound emails sent via SMTP preserve threading headers so replies appear in the same thread in Gmail, Outlook, and Apple Mail
  6. Automated tests verify the full email pipeline (IMAP fetch, parse, thread, classify, store) with mocked IMAP server -- and email threading is verified against Gmail, Outlook, and Apple Mail reply patterns
**Plans**: 6 plans

Plans:
- [x] 02-01: Schema migration + dependencies + IMAP connection service (Wave 1)
- [x] 02-02: Email parser with mailparser/sanitize-html + threading engine (Wave 2, TDD)
- [x] 02-03: Contact matching + email classification + language detection (Wave 2, TDD)
- [x] 02-04: SMTP sending service with threading headers (Wave 2)
- [x] 02-05: Pipeline orchestration — wire all services + email poll processor + inbox SMTP (Wave 3)
- [x] 02-06: Integration tests + Gmail/Outlook/Apple Mail threading verification (Wave 4, TDD)

### Phase 3: Email UI & OTA Parsing
**Goal**: Ines sees live emails in the dashboard inbox and OTA booking notifications are auto-extracted into bookings
**Depends on**: Phase 2
**Requirements**: EMAIL-08, EMAIL-11, OTA-01, OTA-02, OTA-03
**Success Criteria** (what must be TRUE):
  1. The inbox page shows real email conversations sorted by latest message -- Ines can read full threads without leaving the dashboard
  2. Admin settings page allows Ines to configure email provider credentials (IMAP and SMTP host, port, user, password) without code changes
  3. When a Tripaneer or BookYogaRetreats booking notification email arrives, the system extracts guest name, dates, and package -- and creates a booking record linked to the guest
**Plans**: 3 plans

Plans:
- [x] 03-01: Gmail-style inbox UI rewrite with schema extensions, HTML email rendering, attachments, unread tracking, classification badges, auto-refresh (Wave 1)
- [x] 03-02: Email provider settings with encrypted credentials, connection testing, polling control, Tiptap signature editor (Wave 1)
- [x] 03-03: OTA email parser with Tripaneer/BookYogaRetreats extraction, auto-booking creation, bidirectional UI links (Wave 2, TDD)

### Phase 4: AI Communication Engine
**Goal**: The system can generate context-rich, brand-appropriate message drafts using LLM APIs with full business context
**Depends on**: Phase 1
**Requirements**: AI-01, AI-02, AI-03, AI-05, AI-06, ARCH-03
**Success Criteria** (what must be TRUE):
  1. Given a guest inquiry, the AI engine produces a draft reply that includes relevant guest history, current availability, pricing, and brand voice -- without hallucinating facts
  2. Claude API is the primary LLM and OpenAI is the automatic fallback -- switching happens transparently on API failure
  3. Every AI call logs model used, token count (input + output), and estimated cost in EUR -- viewable in admin
  4. Incoming messages containing complaints, medical/dietary requests, cancellations, or adoption inquiries are flagged for priority manual handling
  5. System prompt prefixes are cached using Anthropic prompt caching to reduce cost on repeated calls
**Plans**: 4 plans

Plans:
- [x] 04-01-PLAN.md — OpenClaw Docker Compose service, Gateway config (Claude primary/OpenAI fallback), SOUL.md persona, AiDraft schema migration, agent API endpoints
- [x] 04-02-PLAN.md — Context builder with system prompts and brand voice, edge-case classifier with bilingual detection, cost calculator (TDD)
- [x] 04-03-PLAN.md — SKILL.md files per business domain, draft generator via OpenClaw HTTP API, AiModuleContract implementation, BullMQ job processor wiring
- [x] 04-04-PLAN.md — Gap closure: surface AI token usage, EUR cost, and edge-case flags in admin inbox UI (AI-03)

### Phase 5: AI-Email Integration
**Goal**: Inbound guest emails automatically get AI-drafted replies that Ines can approve, edit, or reject from the inbox -- with automated tests verifying the draft pipeline
**Depends on**: Phase 2, Phase 3, Phase 4
**Requirements**: EMAIL-09, EMAIL-10, AI-04, TEST-02
**Success Criteria** (what must be TRUE):
  1. When a new guest inquiry email arrives, an AI draft reply is automatically generated and visible in the inbox conversation -- within 30 seconds of ingestion
  2. Ines can approve a draft with one click (sends immediately), edit it before sending, or reject it -- all from the inbox UI
  3. Admin can create, edit, and delete FAQ entries (question/answer pairs) that are injected into the AI context for more accurate responses
  4. Automated tests verify AI draft generation end-to-end (context injection, LLM call, draft stored) with mocked LLM responses
**Plans**: 4 plans

Plans:
- [x] 05-01-PLAN.md — Email pipeline AI draft trigger + approve/reject/regenerate backend endpoints (Wave 1)
- [x] 05-02-PLAN.md — FAQ Prisma model, CRUD API, context builder + system prompt injection (Wave 1)
- [x] 05-03-PLAN.md — Draft review UI (two-step approve, reject+regenerate, inline display) + FAQ settings tab (Wave 2)
- [x] 05-04-PLAN.md — AI draft pipeline integration tests + draft workflow tests with mocked LLM (Wave 3, TDD)

### Phase 6: CalDAV Calendar Sync
**Goal**: Ines's Apple Calendar automatically reflects all bookings and events from the system -- always up to date, verified with real iCloud account tests
**Depends on**: Phase 1
**Requirements**: CAL-01, CAL-02, CAL-03, CAL-04, CAL-05, TEST-04
**Success Criteria** (what must be TRUE):
  1. When a booking is created, a calendar event appears in Apple Calendar with guest name, room assignment, dietary info, and arrival time
  2. When a standalone event (puppy yoga, beach walk) is created, it appears in Apple Calendar with title, time, location, and capacity
  3. When a booking or event is updated (room change, dietary change, time change), the corresponding calendar event updates automatically
  4. When a booking or event is cancelled, the corresponding calendar event is deleted from Apple Calendar
  5. CalDAV sync is tested with a real iCloud account -- create, update, and delete calendar events all verified
**Plans**: 4 plans

Plans:
- [x] 06-01-PLAN.md — Schema migration + CalDAV client (tsdav) + iCalendar builder (ical-generator)
- [x] 06-02-PLAN.md — CalDAV sync engine + job processor + booking/event mutation hooks
- [x] 06-03-PLAN.md — Calendar API endpoints + CalDAV settings UI + sync status banner
- [x] 06-04-PLAN.md — iCalendar builder unit tests + CalDAV integration tests (real iCloud) + end-to-end verification

### Phase 7: OpenClaw Assistant Core
**Goal**: Ines can ask her AI assistant business questions from the dashboard or WhatsApp and get accurate answers
**Depends on**: Phase 4
**Requirements**: ASST-01, ASST-02, ASST-03, ASST-04
**Success Criteria** (what must be TRUE):
  1. OpenClaw runtime is self-hosted on the same server and connected to the PYR backend API
  2. Ines can open a chat panel in the admin dashboard and ask questions like "Who's checking in tomorrow?" or "What's the revenue this month?" -- and get correct answers
  3. The same assistant is reachable via WhatsApp on Ines's phone with the same capabilities
  4. The assistant uses Claude tool-use to query real business data (bookings, guests, availability, revenue, today's schedule) -- not hallucinated answers
**Plans**: 2 plans

Plans:
- [x] 07-01-PLAN.md — OpenClaw plugin with ~15 query tools, workspace persona (Koda), WhatsApp channel config, Docker Compose plugin mount
- [x] 07-02-PLAN.md — Backend SSE proxy, dashboard chat UI (streaming, markdown, tool indicators, quick actions), sidebar nav, end-to-end verification

### Phase 8: Assistant Actions & Automation
**Goal**: The assistant can take actions on Ines's behalf (with confirmation) and proactively delivers briefings and alerts
**Depends on**: Phase 7, Phase 5
**Requirements**: ASST-05, ASST-06, ASST-07, ASST-08, ASST-09
**Success Criteria** (what must be TRUE):
  1. Ines can tell the assistant "Create a booking for Anna, Suite room, March 09-19" -- the assistant shows a summary and waits for confirmation before creating it
  2. Every morning at 7:30 AM, the assistant sends a briefing with today's check-ins, check-outs, events, pending inquiries, and yesterday's revenue
  3. The assistant proactively notifies Ines of new bookings, payment confirmations, arriving guests, and overdue invoices
  4. Ines can review and approve AI email drafts directly from the assistant chat ("Reply OK to send")
  5. Ines can ask the assistant to send overdue invoice reminders on request
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md — Plugin write tools (prepare/confirm booking & event), draft approval tools, invoice reminder, confirmation state machine, workspace docs update
- [x] 08-02-PLAN.md — Backend notification service, scheduled processor (morning briefing, guest arrival, overdue invoice), alert wiring in mutations, OpenClaw hook config

### Phase 8.1: Integration Fixes & Verification Closure
**Goal**: All audit gaps are closed -- cross-phase wiring issues fixed, missing verifications produced, and traceability updated
**Depends on**: Phase 8
**Requirements**: OTA-03, CAL-01, ASST-04 (integration fixes); CAL-01..05, TEST-04, ASST-01..04 (retroactive verification)
**Gap Closure**: Closes gaps from v1.0 milestone audit
**Success Criteria** (what must be TRUE):
  1. OTA auto-created bookings trigger CalDAV calendar sync (enqueueCalendarSync called after OTA booking creation in email pipeline)
  2. The assistant's check_availability tool returns real availability data (query params match backend schema)
  3. Phase 6 has a VERIFICATION.md with all CAL-01..05 and TEST-04 requirements verified
  4. Phase 7 has a VERIFICATION.md with all ASST-01..04 requirements verified
  5. REQUIREMENTS.md traceability table is accurate (ASST-02 checkbox fixed, all statuses current)
**Plans**: 2 plans

Plans:
- [x] 08.1-01-PLAN.md — Fix OTA->calendar sync wiring, check_availability param mismatch, integration tests, traceability table update
- [x] 08.1-02-PLAN.md — Retroactive VERIFICATION.md for Phase 6 (CAL-01..05, TEST-04) and Phase 7 (ASST-01..04)

### Phase 9: Switch the backend to use the gateway's WebSocket API

**Goal:** All backend communication with the OpenClaw Gateway uses a single persistent WebSocket connection instead of three separate HTTP integration points (chat completions, hooks, health check)
**Depends on:** Phase 9
**Requirements:** (architectural improvement -- no formal requirement IDs)
**Success Criteria** (what must be TRUE):
  1. A persistent WebSocket connection to the OpenClaw Gateway is established at backend startup with auto-reconnect
  2. Dashboard chat messages are sent via WebSocket `chat.send` and streamed back as SSE (frontend unchanged)
  3. Notifications (briefings, alerts, draft-ready) are sent via WebSocket `agent` method instead of HTTP webhooks
  4. AI draft generation uses WebSocket `agent` method with `extraSystemPrompt` for business context injection
  5. No HTTP calls to the OpenClaw Gateway remain in the backend
**Plans:** 3/3 plans complete

Plans:
- [ ] 09-01-PLAN.md -- GatewayWsClient service, protocol types, Fastify plugin (app.gateway decorator)
- [ ] 09-02-PLAN.md -- Migrate dashboard chat SSE proxy and notification hook delivery to WebSocket
- [ ] 09-03-PLAN.md -- Migrate draft generation to WebSocket, unit tests, HTTP cleanup

### Phase 9: Add database update/migration tools for the AI assistant

**Goal:** The AI assistant can fully manage all business entities -- update, delete, cancel, merge guests/bookings/events, register guests for events, and update settings -- all through natural language with confirmation flow where appropriate
**Depends on:** Phase 9
**Requirements:** ASST-10, ASST-11, ASST-12, ASST-13
**Success Criteria** (what must be TRUE):
  1. Ines can tell the assistant "Update Anna's email to anna@new.com" and it shows a diff of changes for confirmation before applying
  2. Ines can cancel bookings, archive guests, and delete events through the assistant with a confirmation step
  3. Ines can merge duplicate guests and register guests for events through the assistant
  4. Ines can update safe application settings (briefing time, business name, timezone) directly through the assistant
  5. Delete operations on 204 No Content responses work without JSON parse errors
**Plans:** 2/2 plans complete

Plans:
- [ ] 09-01-PLAN.md -- ApiClient 204 fix, PendingAction type extension, guest CRUD tools (update/delete/merge), booking tools (update/cancel)
- [ ] 09-02-PLAN.md -- Event tools (update/delete/register), conversation update, settings update, index.ts tool count, verification

### Phase 11: Documentation & OTA Alert Fix
**Goal:** Close all remaining v1.0 audit gaps -- module documentation, Swagger updates, OpenClaw integration guide, and OTA booking alert wiring
**Depends on:** Phase 10
**Requirements:** DOC-01, DOC-02, DOC-03, ASST-07 (integration fix)
**Gap Closure:** Closes gaps from v1.0 milestone audit
**Success Criteria** (what must be TRUE):
  1. Each new module (email, AI, calendar, assistant) has an ARCHITECTURE.md or README documenting its purpose, interfaces, and configuration
  2. API endpoints for new modules are documented in Swagger with request/response examples
  3. OpenClaw integration is documented with setup instructions, plugin configuration, and channel setup
  4. OTA auto-created bookings trigger a WhatsApp notification to Ines (sendNewBookingAlert called in email pipeline OTA path)
**Plans**: 4 plans

Plans:
- [x] 11-01-PLAN.md -- OTA booking alert wiring + Swagger infrastructure (zod-openapi, tag descriptions, shared error schema)
- [x] 11-02-PLAN.md -- Swagger enrichment: .openapi() examples + error responses across all 13 modules
- [x] 11-03-PLAN.md -- ARCHITECTURE.md for email and AI modules
- [x] 11-04-PLAN.md -- ARCHITECTURE.md for CalDAV calendar and assistant/OpenClaw (integration guide)
