# PUPPY YOGA RETREAT
## MVP Project Execution Plan
*Epics, Tasks & Execution Roadmap*

---

| | |
|---|---|
| **Prepared by** | AVA Studio |
| **Client** | Ines Brendel / Puppy Yoga Retreat |
| **Date** | February 2026 |
| **Scope** | Phase 1 — MVP (Core Platform) |

---

## Table of Contents

1. [Introduction & Approach](#1-introduction--approach)
2. [MVP Scope Summary](#2-mvp-scope-summary)
3. [Epic Overview](#3-epic-overview)
4. [Detailed Epics & Tasks](#4-detailed-epics--tasks)
5. [Timeline & Estimation Summary](#5-timeline--estimation-summary)
6. [Dependencies & Sequencing](#6-dependencies--sequencing)
7. [Parallel Workstreams](#7-parallel-workstreams)
8. [Risks & Mitigations](#8-risks--mitigations)
9. [Definition of Done (MVP)](#9-definition-of-done-mvp)
10. [Next Steps](#10-next-steps)

---

## 1. Introduction & Approach

This document is the execution plan for Phase 1 (MVP) of the Puppy Yoga Retreat automation platform. It translates the project specification into actionable epics and tasks with clear dependencies, priorities, and estimates.

The MVP delivers the foundational system that replaces Ines's Excel-based workflows with a proper CRM, automated email handling with AI-drafted replies, a unified calendar synced to her phone, and a personal AI assistant she can message to control her business.

**Strategy:** We build the data layer first (database, API), then layer on the CRM, email ingestion, AI engine, calendar, and assistant in parallel workstreams where possible. The admin dashboard grows incrementally as backend modules come online. We close with data migration, end-to-end testing, and a supervised go-live.

**What this plan covers:** 9 epics, 55 tasks, covering everything needed to go from zero to a working MVP in daily use. Each task includes a description, priority, time estimate, and dependencies.

**What comes after MVP:** Website booking widget (Phase 2), WhatsApp & Instagram integration (Phase 3), OTA platform integrations (Phase 4), and accounting module (Phase 5) are documented in the main project specification and will have their own execution plans.

---

## 2. MVP Scope Summary

The MVP delivers these capabilities on day one:

- **Centralized CRM** replacing all guest/booking Excel spreadsheets with a searchable, relational database.
- **Email ingestion & AI-drafted replies** for GMX email, including Tripaneer/BookYogaRetreats notification parsing.
- **Unified Inbox** in the admin dashboard where Ines reviews, edits, and approves AI-drafted responses with one click.
- **Calendar & event management** with one-way sync to Apple Calendar, so Ines sees her full schedule on her phone.
- **AI Communication Engine** with context-aware drafting (guest history, availability, pricing, brand voice, multi-lingual EN/DE).
- **Personal AI Assistant** accessible via Telegram (or WhatsApp), where Ines can query bookings, approve messages, create events, and get daily briefings.
- **Admin Dashboard** with overview KPIs, booking/event management, calendar view, and the unified inbox.
- **Data migration** from existing Excel files into the new system.

---

## 3. Epic Overview

| ID | Epic | Status | Tasks | Est. | Timing |
|----|------|:------:|:-----:|:----:|:------:|
| E1 | Project Setup & Infrastructure | ✅ Complete | 7 | 5 days | Week 1 |
| E2 | Database Design & Backend API | ✅ Complete | 10 | 13.5 days | Weeks 1–3 |
| E3 | CRM & Guest Management | ✅ Complete | 4 | 5.5 days | Weeks 3–4 |
| E4 | Email Ingestion & Unified Inbox | Pending | 7 | 10 days | Weeks 3–5 |
| E5 | Admin Dashboard | ✅ Complete | 6 | 9.5 days | Weeks 3–5 |
| E6 | AI Communication Engine | Pending | 5 | 6 days | Weeks 4–5 |
| E7 | Calendar & Apple Calendar Sync | Pending | 4 | 6.5 days | Weeks 4–6 |
| E8 | Personal AI Assistant | Pending | 6 | 11 days | Weeks 5–7 |
| E9 | Testing, Migration & Launch | Pending | 6 | 12 days | Weeks 7–9 |

---

## 4. Detailed Epics & Tasks

---

### E1: Project Setup & Infrastructure ✅ COMPLETE

*Set up the development environment, hosting infrastructure, CI/CD pipeline, and foundational project structure. This epic establishes the technical bedrock that all other work builds upon.*

> **Completed:** Monorepo (pnpm + Turborepo), Docker Compose (PostgreSQL 16 + Redis 7), GitHub Actions CI, `.env` validation (Zod), TypeScript strict mode, Fastify 5 backend, Next.js 15 frontend, shared package.

| Task ID | Task | Priority | Est. | Depends On | Description |
|---------|------|:--------:|:----:|:----------:|-------------|
| E1-T1 | Initialize project repository (monorepo structure) | **Critical** | 0.5d | — | Set up Git repo with monorepo layout: /backend, /frontend, /shared, /scripts, /docs. Define branching strategy, commit conventions, and PR templates. |
| E1-T2 | Provision Hetzner Cloud server (EU region) | **Critical** | 0.5d | — | Spin up a Hetzner CX31 or CX41 VPS (EU datacenter for GDPR). Install Ubuntu 24 LTS, harden SSH, configure firewall (UFW), set up fail2ban. |
| E1-T3 | Set up Docker & Docker Compose environment | **Critical** | 1d | E1-T2 | Create Docker Compose config for: PostgreSQL 16, Redis 7, Node.js backend, frontend dev server. Define persistent volumes, networking, environment variables. |
| E1-T4 | Configure CI/CD pipeline | High | 1d | E1-T1, E1-T3 | GitHub Actions or GitLab CI: lint, test, build, deploy to Hetzner on merge to main. Automated DB migrations on deploy. |
| E1-T5 | Set up reverse proxy, SSL, and domain routing | High | 0.5d | E1-T2 | Nginx or Caddy as reverse proxy. Let's Encrypt SSL for API and dashboard domains. Configure subdomains: api.*, app.*, widget.* |
| E1-T6 | Configure logging, monitoring, and error tracking | Medium | 1d | E1-T3 | Structured JSON logging (pino/winston). Optional: Sentry for error tracking, basic uptime monitoring (UptimeRobot or similar). |
| E1-T7 | Establish environment configuration management | High | 0.5d | E1-T1 | Define .env schema for all services. Secrets management for API keys, DB passwords, IMAP credentials. Document all required env vars. |

---

### E2: Database Design & Backend API Foundation ✅ COMPLETE

*Design the complete PostgreSQL schema and build the backend REST API framework. This is the data backbone of the entire platform — every other module depends on it.*

> **Completed:** Full Prisma schema (16 tables), all CRUD modules (guests, bookings, rooms, events, inbox, dashboard, settings), cursor pagination, JWT + API key auth, audit logging, Swagger docs. Post-E2 audit: 57 issues fixed.

| Task ID | Task | Priority | Est. | Depends On | Description |
|---------|------|:--------:|:----:|:----------:|-------------|
| E2-T1 | Design and document the full database schema | **Critical** | 2d | E1-T1 | Design tables for: guests, bookings, rooms, room_types, events, event_bookings, messages, conversations, channels, invoices, payments, calendar_events, ai_drafts, audit_log. Define relationships, indexes, constraints. Produce an ERD diagram. |
| E2-T2 | Set up PostgreSQL with migrations framework | **Critical** | 1d | E1-T3, E2-T1 | Initialize PostgreSQL 16 in Docker. Set up migration tool (Knex.js, Prisma, or node-pg-migrate). Create initial migration with all tables. |
| E2-T3 | Build backend project skeleton (Node.js/Fastify or Python/FastAPI) | **Critical** | 1d | E1-T3 | Initialize the backend project with chosen framework. Set up routing structure, middleware (auth, CORS, rate limiting, request validation), error handling, and health-check endpoint. |
| E2-T4 | Implement authentication & authorization layer | **Critical** | 1.5d | E2-T3 | JWT-based auth for the admin dashboard. API key auth for the AI assistant. Role: single admin user (Ines). Session management, token refresh, secure password hashing. |
| E2-T5 | Build CRUD API for Guests module | **Critical** | 1.5d | E2-T2, E2-T3 | Endpoints: list/search/filter guests, get guest detail, create/update guest, merge duplicates, add notes/tags. Include pagination and full-text search. |
| E2-T6 | Build CRUD API for Rooms & Room Types module | **Critical** | 1d | E2-T2, E2-T3 | Endpoints: list room types with pricing/seasons, list rooms with current status, update room details. Pricing model: base rate per room type per season. |
| E2-T7 | Build CRUD API for Bookings module | **Critical** | 2d | E2-T5, E2-T6 | Endpoints: create booking (validates availability, assigns room), update/cancel booking, list bookings with filters (date range, status, guest). Booking statuses: inquiry, confirmed, checked-in, checked-out, cancelled. |
| E2-T8 | Build CRUD API for Events module | **Critical** | 1.5d | E2-T2, E2-T3 | Endpoints: create event (type, date, time, capacity, location), list events, update event, manage event bookings/registrations with capacity enforcement and waitlists. |
| E2-T9 | Build Messages & Conversations API | High | 1.5d | E2-T5 | Endpoints: list conversations (threaded, linked to guest), get conversation detail, create message (inbound/outbound), update message status. Support channel tagging (email, whatsapp, instagram, etc.). |
| E2-T10 | Build seed data & Excel import script | High | 1.5d | E2-T5, E2-T7 | Parse Ines's existing Excel spreadsheets. Map columns to the new schema. Import guests, historical bookings, and financial records. Validate and deduplicate during import. |

---

### E3: CRM & Guest Management ✅ COMPLETE

*Build the guest relationship management module that replaces Ines's Excel-based guest tracking. Central profile with full history, preferences, and communication log.*

> **Completed:** Guest CRUD, filter bar (search/source/tag/language), timeline view, merge UI, rich detail page with booking + event history. Post-E3 audit: 49 issues fixed, 151 backend + 28 frontend tests green.

| Task ID | Task | Priority | Est. | Depends On | Description |
|---------|------|:--------:|:----:|:----------:|-------------|
| E3-T1 | Guest profile page (full detail view) | **Critical** | 2d | E2-T5, E5-T1 | Frontend view: contact info, inquiry source, all bookings (past & upcoming), full communication history (threaded), dietary preferences, travel notes, adoption interest flag, custom tags. |
| E3-T2 | Guest list with search, filter, and tags | **Critical** | 1.5d | E2-T5, E5-T1 | Paginated guest list with: full-text search (name, email), filter by tag/source/date, sortable columns, quick-view card. Bulk tag assignment. |
| E3-T3 | Guest merge & deduplication tool | Medium | 1d | E3-T1 | Detect potential duplicates (same email or similar name). UI to compare and merge two guest profiles, consolidating all bookings, messages, and notes into one record. |
| E3-T4 | Guest notes, activity timeline, and internal annotations | High | 1d | E3-T1 | Chronological activity feed on guest profile: booking created, email sent, payment received, note added. Internal notes field (not visible to guest). Quick-add note from anywhere in the dashboard. |

---

### E4: Email Ingestion & Unified Inbox (GMX)

*Connect to the GMX email account via IMAP, ingest all incoming messages, thread them by conversation, link them to CRM contacts, and provide a unified inbox interface in the dashboard. This is the first communication channel integrated and establishes the pattern for all subsequent channels.*

| Task ID | Task | Priority | Est. | Depends On | Description |
|---------|------|:--------:|:----:|:----------:|-------------|
| E4-T1 | Build IMAP polling service for GMX inbox | **Critical** | 2d | E2-T9 | Service that connects to imap.gmx.net:993 via IMAP IDLE (or 1–2 min polling fallback). Fetches new emails, extracts sender, subject, body (plain text + HTML), attachments metadata. Stores raw message in DB. |
| E4-T2 | Email parsing, threading, and contact matching | **Critical** | 1.5d | E4-T1, E2-T5 | Parse email headers (In-Reply-To, References, Message-ID) to thread conversations. Match sender email to existing CRM guest. If no match, create new guest record. Link message to conversation thread. |
| E4-T3 | SMTP sending service (outbound email) | **Critical** | 1d | E4-T1 | Send emails via mail.gmx.net:587 using SMTP. Maintain threading headers (In-Reply-To, References). Send from puppyyogaretreat@gmx.de. Support HTML templates for formatted replies. |
| E4-T4 | Build Unified Inbox UI (dashboard) | **Critical** | 2.5d | E4-T2, E5-T1 | Inbox view: list of conversations sorted by latest message. Each shows: guest name, channel icon, subject/preview, timestamp, status (new/draft-ready/replied). Click to open conversation thread with full history. AI draft shown inline with approve/edit buttons. |
| E4-T5 | Integrate AI draft generation into email flow | **Critical** | 1.5d | E4-T2, E6-T1, E6-T2 | When a new inbound email is ingested: trigger AI engine with conversation context, guest CRM data, availability, and system prompt. Store generated draft linked to the conversation. Flag conversation as "draft-ready" for Ines's review. |
| E4-T6 | Approve/edit/send workflow for AI drafts | **Critical** | 1d | E4-T4, E4-T3 | In the inbox UI: one-click approve sends the AI draft via SMTP. Edit button opens inline editor for tweaks before sending. Sent messages stored in DB and appear in conversation thread. |
| E4-T7 | Email notification parsing for OTA platforms (Tripaneer, BookYogaRetreats) | High | 1.5d | E4-T2 | Identify booking notification emails from Tripaneer/BookYogaRetreats by sender/subject patterns. Extract structured data (guest name, dates, package) using regex or AI-assisted parsing. Auto-create booking records and link to guest. |

---

### E5: Admin Dashboard ✅ COMPLETE

*Build the web-based admin dashboard that serves as Ines's primary management interface. It ties together the CRM, bookings, calendar, inbox, and reporting into one cohesive application.*

> **Completed:** Next.js 15 App Router, JWT auth (login + auto-redirect), pages for bookings, events, guests, inbox, calendar (month + week views), settings. shadcn/ui component library. Post-E5 audit: all 10 phases clean.

| Task ID | Task | Priority | Est. | Depends On | Description |
|---------|------|:--------:|:----:|:----------:|-------------|
| E5-T1 | Set up frontend project (React/Next.js) with auth | **Critical** | 1.5d | E2-T4 | Initialize React/Next.js project. Implement login page, JWT-based auth flow, protected routes. Set up component library (Tailwind + shadcn/ui or similar), global layout with sidebar navigation. |
| E5-T2 | Dashboard home page (overview & KPIs) | High | 1.5d | E5-T1, E2-T7, E2-T8 | Landing page with: upcoming check-ins/check-outs today, pending inquiries count, bookings this week, revenue this month, next events. Quick-action buttons: new booking, new event, check inbox. |
| E5-T3 | Bookings management page | **Critical** | 2d | E5-T1, E2-T7 | List all bookings with filters (date range, status, room, guest name). Click to view/edit booking details. Create new booking form with room/date picker and availability check. Status lifecycle management (confirm, check-in, check-out, cancel). |
| E5-T4 | Events management page | **Critical** | 1.5d | E5-T1, E2-T8 | List events (upcoming, past). Create event form: type (Puppy Yoga, Beach Walk, Coffee/Cake/Cuddles), date/time, capacity, location, description. View registrations per event. Capacity indicators and waitlist management. |
| E5-T5 | Calendar view (visual schedule) | High | 2d | E5-T3, E5-T4 | Monthly/weekly calendar view showing: retreat bookings (color-coded by room), standalone events, check-in/check-out markers. Click event/booking to view details. Create new entries by clicking a date. |
| E5-T6 | Settings & configuration page | Medium | 1d | E5-T1 | Admin settings: room types & pricing management, season definitions, event type templates, email signature, AI system prompt customization, business hours, notification preferences. |

---

### E6: AI Communication Engine

*Build the AI-powered message drafting engine. This is the intelligence layer that reads incoming messages, enriches them with business context, and generates ready-to-send replies matching the brand voice.*

| Task ID | Task | Priority | Est. | Depends On | Description |
|---------|------|:--------:|:----:|:----------:|-------------|
| E6-T1 | Design and build the AI system prompt & context injection layer | **Critical** | 2d | E2-T5, E2-T7 | Define the master system prompt: business description, brand voice (warm, mindful, animal-welfare focused), FAQ knowledge base (cancellation policy, what to bring, airport transfers, meal info, puppy info). Build context injection: for each message, compile guest CRM data, conversation history, current availability, pricing, and upcoming events into a structured prompt. |
| E6-T2 | Implement LLM API integration (OpenAI / Claude) | **Critical** | 1d | E6-T1 | Build abstracted LLM service that supports both OpenAI and Anthropic Claude APIs. Model-agnostic interface so models can be swapped. Handle rate limits, retries, token counting, and cost logging. |
| E6-T3 | Language detection and multi-lingual response generation | High | 1d | E6-T2 | Detect incoming message language (EN/DE primarily). Instruct AI to respond in the same language. Include German-specific templates and phrasing guidelines in the system prompt. |
| E6-T4 | Build FAQ & knowledge base management | High | 1d | E6-T1 | Admin UI to manage FAQ entries: question/answer pairs, categorized (booking, logistics, yoga, puppies, payment). These are injected into the AI context. Ines can add/edit/remove entries without code changes. |
| E6-T5 | Edge case detection & flagging | High | 1d | E6-T2 | Classify incoming messages for: complaints, special medical/dietary requests, cancellation/refund requests, adoption inquiries. Flag these for priority manual handling rather than auto-drafting. Configurable rules. |

---

### E7: Calendar & Event System with Apple Calendar Sync

*Build the database-driven calendar and event system, and implement one-way CalDAV push to Apple Calendar so Ines always has her schedule on her phone.*

| Task ID | Task | Priority | Est. | Depends On | Description |
|---------|------|:--------:|:----:|:----------:|-------------|
| E7-T1 | Implement CalDAV sync service (push to Apple Calendar) | **Critical** | 2d | E2-T7, E2-T8 | Build CalDAV client that connects to Apple Calendar (iCloud CalDAV endpoint). One-way push: when a booking or event is created/updated/cancelled in the DB, create/update/delete the corresponding calendar event. Include guest names, room assignments, dietary info in event description. |
| E7-T2 | Event creation & management engine | **Critical** | 1.5d | E2-T8 | Business logic layer for event management: create event with type, date, time, capacity, location. Auto-generate booking slots. Enforce capacity limits. Support recurring event templates (e.g., weekly Puppy Yoga). Cancel/reschedule with notification triggers. |
| E7-T3 | Availability engine (rooms & events) | **Critical** | 2d | E2-T7, E2-T8 | Central availability service: query room availability for any date range, check event capacity. Prevent double-bookings. Return available rooms/slots with pricing. This service is consumed by: dashboard, booking widget (Phase 2), AI assistant, and OTA sync (Phase 4). |
| E7-T4 | Calendar event enrichment on booking updates | High | 1d | E7-T1 | When a booking is updated (guest dietary change, room reassignment, payment received), automatically update the corresponding Apple Calendar event with the new details. Include structured info: guest name, room, diet, arrival time, payment status. |

---

### E8: Personal AI Assistant

*Build Ines's personal conversational AI assistant that connects to a messaging app and provides full business control from her phone. The assistant reads from and writes to the platform via the REST API.*

| Task ID | Task | Priority | Est. | Depends On | Description |
|---------|------|:--------:|:----:|:----------:|-------------|
| E8-T1 | Build AI assistant core agent (NLU + action routing) | **Critical** | 3d | E6-T2, E2-T5, E2-T7, E2-T8, E2-T9 | Core agent that: receives a natural language message from Ines, determines intent (query data, manage communication, take action), calls the appropriate REST API endpoint, formats the response conversationally. Uses LLM with function-calling/tool-use for structured API calls. |
| E8-T2 | Connect assistant to messaging platform (Telegram or WhatsApp) | **Critical** | 1.5d | E8-T1 | Integrate with Telegram Bot API (immediate, no approval needed) as primary channel. Optionally connect to WhatsApp via linked device or Business API when available. Handle message formatting, media, and conversation state. |
| E8-T3 | Implement query capabilities (bookings, availability, revenue, guests) | **Critical** | 2d | E8-T1 | Assistant can answer: "How many bookings next month?", "Is Room 3 free March 15–22?", "What's revenue this month?", "Who's checking in tomorrow?", "Show me pending inquiries." Each maps to specific API calls with formatted responses. |
| E8-T4 | Implement action capabilities with confirmation flow | **Critical** | 2d | E8-T1 | Assistant can: create bookings, create events, send payment reminders, approve AI message drafts. All write operations require Ines to confirm ("Book Room 3 for John Smith, April 1–4. Confirm?" → Ines replies "yes" → action executed). Confirmation timeout and cancellation handling. |
| E8-T5 | Build scheduled briefings and proactive alerts | High | 1.5d | E8-T2 | Cron-based scheduled messages: morning briefing at 7:30 AM (today's check-ins/outs, events, pending inquiries, yesterday's revenue). Event-driven alerts: new booking received, payment confirmed, guest arriving tomorrow, overdue invoice. |
| E8-T6 | Message draft approval via assistant | High | 1d | E8-T1, E4-T5 | When a new AI draft is generated for an inbound message, the assistant sends it to Ines on her messaging app: "New inquiry from Sarah Miller. Here's my draft reply: [draft]. Reply OK to send, or edit." Lowest-friction approval workflow. |

---

### E9: Testing, Data Migration & Launch Preparation

*End-to-end testing, real data migration from Excel, UAT with Ines, performance tuning, and production deployment of the MVP.*

| Task ID | Task | Priority | Est. | Depends On | Description |
|---------|------|:--------:|:----:|:----------:|-------------|
| E9-T1 | Write unit and integration tests for all API endpoints | High | 3d | E2-T5 through E2-T9 | Test coverage for: CRUD operations on all modules, availability engine edge cases (overlapping bookings, capacity limits), email ingestion and threading, AI draft generation pipeline. Use Jest or Vitest with test database. |
| E9-T2 | Migrate real data from Excel spreadsheets | **Critical** | 1.5d | E2-T10 | Run the import script on Ines's actual Excel files. Validate all imported data: guest records, historical bookings, financial records. Resolve duplicates and data quality issues. Ines reviews and approves the migrated data. |
| E9-T3 | End-to-end testing of all core workflows | **Critical** | 2d | All epics | Test complete flows: email arrives → ingested → AI draft → approve → sent. Create booking via dashboard → appears on Apple Calendar. Ask AI assistant a question → correct answer. Create event via assistant → visible on dashboard and calendar. |
| E9-T4 | User acceptance testing (UAT) with Ines | **Critical** | 3d | E9-T3 | Hands-on sessions with Ines testing every feature. Walk through daily workflows. Collect feedback on AI draft quality, dashboard usability, assistant responsiveness. Iterate on issues. Train Ines on the system. |
| E9-T5 | Performance tuning and security hardening | High | 1.5d | E9-T3 | Load testing for API endpoints. Optimize slow DB queries (add indexes). Redis caching for frequently accessed data (availability, pricing). GDPR compliance check: data encryption at rest, secure API keys, audit logging. |
| E9-T6 | Production deployment and go-live | **Critical** | 1d | E9-T4, E9-T5 | Final deployment to production. DNS cutover. Verify all services healthy. Monitor for first 48 hours. Establish rollback plan. Document operational runbook. |

---

## 5. Timeline & Estimation Summary

Total estimated effort across all epics is approximately 79 task-days. With parallel workstreams and a small team, the MVP targets an 8–9 week delivery window.

| Epic | Name | Estimated Effort | Target Weeks | Tasks |
|------|------|:----------------:|:------------:|:-----:|
| E1 | Project Setup & Infrastructure | 5 days | Week 1 | 7 |
| E2 | Database Design & Backend API | 13.5 days | Weeks 1–3 | 10 |
| E3 | CRM & Guest Management | 5.5 days | Weeks 3–4 | 4 |
| E4 | Email Ingestion & Unified Inbox | 10 days | Weeks 3–5 | 7 |
| E5 | Admin Dashboard | 9.5 days | Weeks 3–5 | 6 |
| E6 | AI Communication Engine | 6 days | Weeks 4–5 | 5 |
| E7 | Calendar & Apple Calendar Sync | 6.5 days | Weeks 4–6 | 4 |
| E8 | Personal AI Assistant | 11 days | Weeks 5–7 | 6 |
| E9 | Testing, Migration & Launch | 12 days | Weeks 7–9 | 6 |

---

## 6. Dependencies & Sequencing

The critical path runs through the following sequence:

- **Infrastructure (E1)** must complete first — everything else needs the server, database, and CI/CD pipeline.
- **Database & API (E2)** starts in parallel with E1 (schema design can begin immediately) and is the prerequisite for all feature modules.
- **CRM (E3), Email (E4), Dashboard (E5), AI Engine (E6), Calendar (E7)** can progress in parallel once the relevant API endpoints from E2 are ready.
- **AI Assistant (E8)** depends on having the API layer, AI engine, and at least the email/inbox flow working. It starts in Week 5 and is one of the later features to complete.
- **Testing & Launch (E9)** begins once all other epics are substantially complete. UAT with Ines is the final gate before go-live.

---

## 7. Parallel Workstreams

To compress the timeline, the following workstreams can run in parallel after the API foundation is in place:

- **Workstream A (Backend-heavy):** Email ingestion (E4-T1 to E4-T3), Calendar sync (E7), Availability engine (E7-T3).
- **Workstream B (Frontend-heavy):** Admin Dashboard pages (E5), CRM UI (E3), Unified Inbox UI (E4-T4).
- **Workstream C (AI-heavy):** AI engine prompt design (E6), AI assistant agent (E8-T1), draft generation pipeline (E4-T5).

A single full-stack developer can alternate between these workstreams. With two developers, workstreams A+B or A+C can run simultaneously, potentially reducing the timeline to 6–7 weeks.

---

## 8. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|:----------:|------------|
| GMX IMAP rate limits or connection drops | High | Implement exponential backoff, connection pooling, and IMAP IDLE with fallback to polling. Monitor connection health. |
| Apple CalDAV authentication changes | Medium | Use app-specific password. Monitor for iCloud API changes. Have fallback to .ics file export if CalDAV breaks. |
| AI draft quality not meeting Ines's standards | High | Iterative prompt engineering during UAT. Collect approved vs. edited drafts to improve. Allow Ines to customize the system prompt. |
| Data migration quality (messy Excel data) | Medium | Early access to Excel files for profiling. Build validation rules into the import script. Ines reviews all imported data before go-live. |
| Meta Business verification delays (WhatsApp/Instagram) | Medium | Not a blocker for MVP — these are Phase 3. Start the application process in Week 1 so it's ready when needed. |
| Scope creep during UAT | Medium | Clearly define MVP boundaries in this document. Track feature requests for Phase 2+ backlog. Stay disciplined. |
| Single point of failure (one server) | Low | Automated daily backups (DB + files). Documented disaster recovery procedure. Can spin up replacement server from Docker Compose in under 1 hour. |

---

## 9. Definition of Done (MVP)

The MVP is considered complete and ready for daily use when all of the following criteria are met:

- ✅ All guest and booking data from Excel has been migrated and verified by Ines.
- ✅ Incoming emails from GMX are automatically ingested, threaded, and linked to CRM contacts.
- ✅ AI-drafted replies are generated for new inquiries with correct context, language, and brand voice.
- ✅ Ines can review, edit, and approve AI drafts from the dashboard inbox, and approved messages are sent automatically.
- ✅ Bookings and events can be created, updated, and cancelled via the admin dashboard.
- ✅ All bookings and events are reflected on Ines's Apple Calendar within 2 minutes of creation.
- ✅ The personal AI assistant responds accurately to business queries via Telegram/WhatsApp.
- ✅ The assistant can create bookings and events with Ines's confirmation.
- ✅ Morning briefings are delivered automatically at the configured time.
- ✅ Tripaneer/BookYogaRetreats booking notification emails are parsed and auto-created as booking records.
- ✅ The system has been tested end-to-end and Ines has signed off after UAT.
- ✅ Production deployment is stable, monitored, and backed up.

---

## 10. Next Steps

Upon approval of this execution plan:

1. **Review & approve this plan.** Ines confirms scope, priorities, and timeline.
2. **Produce the Technical Specification.** Based on this plan, we create the detailed technical document covering: full database schema (ERD + DDL), API endpoint specifications (OpenAPI/Swagger), AI system prompt templates, CalDAV integration specs, infrastructure diagram, and deployment architecture.
3. **Gather credentials & access.** GMX email credentials, existing Excel files for data import, Apple ID for Calendar sync, Telegram bot token.
4. **Begin parallel registration processes.** Start Meta Business verification, GetYourGuide Integrator Portal registration, Viator kickoff request, BookRetreats partner application. These run alongside development.
5. **Kick off Sprint 1.** Start with E1 (Infrastructure) and E2 (Database & API design) simultaneously.

---

*Prepared by AVA Studio*
*February 2026 — Peyia, Cyprus*
