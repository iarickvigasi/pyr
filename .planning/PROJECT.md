# Puppy Yoga Retreat — Business Automation Platform

## What This Is

A centralized CRM/PMS and communication platform for Puppy Yoga Retreat, a wellness retreat in Peyia, Cyprus combining yoga, meditation, and rescued puppy interaction. Replaces manual Excel spreadsheets and copy-paste workflows across 8+ platforms with a single system — covering guest management, bookings, events, email with AI-drafted replies, calendar sync, and a personal AI assistant accessible from Ines's phone.

## Core Value

Ines can manage her entire business from one system — see every guest, booking, and message in one place, get AI-drafted replies she approves with one tap, and control everything from her phone via the AI assistant.

## Requirements

### Validated

<!-- Shipped and confirmed working. -->

- ✓ PostgreSQL schema with 16 tables (guests, bookings, rooms, events, conversations, messages, ai_drafts, calendar_events, invoices, payments, audit_log, etc.) — E2
- ✓ Backend REST API (Fastify 5) with all CRUD modules: guests, bookings, rooms/room-types/seasons, events, conversations/messages, dashboard stats, settings — E2
- ✓ JWT auth for dashboard + API key auth for AI assistant — E2
- ✓ Cursor-based pagination on all list endpoints — E2
- ✓ Audit logging on all mutations (entity write + audit log atomic in transactions) — E2
- ✓ Soft deletes for guests and bookings — E2
- ✓ Availability engine with per-night seasonal pricing — E2
- ✓ Season overlap detection — E2
- ✓ Admin dashboard (Next.js 15): login, bookings, events, guests, inbox, calendar (month + week views), settings — E5
- ✓ CRM: guest profiles with full detail, search/filter/tag, merge duplicates, activity timeline — E3
- ✓ Swagger API documentation — E2
- ✓ Docker Compose (PostgreSQL 16 + Redis 7), CI/CD via GitHub Actions — E1
- ✓ Rate limiting on login (5/min) — E2
- ✓ Deep health check (DB + Redis) — E1

### Active

<!-- Current scope — MVP remaining work. -->

- [ ] IMAP polling service for GMX inbox (imap.gmx.net:993)
- [ ] Email parsing, threading (In-Reply-To/References), and CRM contact matching
- [ ] SMTP sending service (mail.gmx.net:587) with threading headers
- [ ] Unified inbox UI with live email data (currently UI exists but no email backend)
- [ ] AI draft generation integrated into email flow (auto-draft on new inbound)
- [ ] Approve/edit/send workflow for AI drafts in inbox UI
- [ ] OTA email notification parsing (Tripaneer/BookYogaRetreats booking emails)
- [ ] AI system prompt with business context injection (guest data, availability, pricing, FAQ, brand voice)
- [ ] LLM API integration (Claude primary, OpenAI fallback) with model-agnostic abstraction
- [ ] Language detection and multi-lingual response generation (EN/DE)
- [ ] FAQ & knowledge base management (admin UI for question/answer pairs)
- [ ] Edge case detection & flagging (complaints, medical/dietary, cancellations)
- [ ] CalDAV sync service — one-way push to Apple Calendar (iCloud)
- [ ] Calendar event enrichment on booking/event updates
- [ ] AI assistant core agent (NLU + action routing via function-calling)
- [ ] Telegram Bot API integration for assistant
- [ ] Query capabilities (bookings, availability, revenue, guests)
- [ ] Action capabilities with confirmation flow (create bookings, events, send reminders)
- [ ] Scheduled briefings (morning briefing at 7:30 AM) and proactive alerts
- [ ] Message draft approval via assistant ("Reply OK to send")
- [ ] Unit and integration tests for remaining modules
- [ ] Excel data migration (real guest/booking data)
- [ ] End-to-end workflow testing
- [ ] UAT with Ines
- [ ] Performance tuning and security hardening
- [ ] Production deployment and go-live

### Out of Scope

<!-- Explicit boundaries — Phases 2-5. -->

- Website booking widget with payments — Phase 2 (PayPal + SEPA bank transfer)
- WhatsApp Business API integration — Phase 3 (requires Meta Business verification)
- Instagram DM API integration — Phase 3 (requires Meta Business verification)
- OTA API integrations (GetYourGuide, Viator, BookRetreats) — Phase 4
- AI bot fallback for platforms without API access — Phase 4
- Accounting & reporting module (revenue by channel, P&L) — Phase 5
- Guest follow-up automation (thank-you emails, review requests) — Phase 5
- Multi-user/multi-tenancy — not needed (single admin: Ines)
- Mobile native app — web-first, mobile later

## Context

- **Business:** Wellness retreat in Peyia (8560), Paphos, Cyprus. Timezone: Europe/Nicosia (EET/EEST).
- **Owner:** Ines Brendel — sole admin user. Manages everything personally.
- **Offerings:** 4-day and 7-day retreat packages (accommodation, yoga, vegetarian meals, puppy interaction) + standalone events (Puppy Yoga 90min, Beach Walks, Coffee/Cake/Cuddles).
- **Animal welfare:** All puppies are rescues. This is core to the brand identity.
- **Languages:** EN and DE with equal quality. Detect from guest messages or profile.
- **Current pain:** Manual Excel tracking, copy-paste across 8+ platforms, repetitive message drafting.
- **Existing code:** E1 (infrastructure), E2 (database + API), E3 (CRM), E5 (dashboard) are complete. 151 backend + 28 frontend tests passing. Post-audit: 49+57 issues fixed.
- **Brand voice for AI:** Warm, welcoming, mindful, calming, animal-welfare focused, concise. Sign off as Ines (not as a bot).

## Constraints

- **Tech stack**: TypeScript strict, Fastify 5, Next.js 15, Prisma + PostgreSQL 16, Redis 7 + BullMQ — locked, already in use
- **Hosting**: Hetzner Cloud EU — GDPR compliance required
- **Email**: GMX (imap.gmx.net:993 / mail.gmx.net:587) — puppyyogaretreat@gmx.de
- **Calendar**: Apple Calendar via CalDAV — one-way push only (DB is source of truth)
- **AI**: Claude API primary, OpenAI fallback — model-agnostic abstraction
- **Financial**: All amounts in EUR, stored as integer cents
- **Auth**: Single admin user, JWT for dashboard, API key for assistant
- **AI safety**: All AI-generated content is a draft — never auto-send without human approval
- **Assistant writes**: All write operations from AI assistant require Ines's explicit confirmation

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fastify 5 over Express | Better TypeScript support, schema-first with Zod, faster | ✓ Good |
| Prisma over Knex/raw SQL | Type-safe queries, migration management, schema visualization | ✓ Good |
| scrypt over bcrypt | Node.js built-in, no native dependencies | ✓ Good |
| Cursor pagination everywhere | Consistent, performant for large datasets | ✓ Good |
| Integer cents for money | Avoids floating-point issues | ✓ Good |
| Telegram first for assistant | No approval process needed (unlike WhatsApp) | — Pending |
| shadcn/ui (new-york) + Tailwind v4 | Composable, modern, good DX | ✓ Good |
| pnpm + Turborepo monorepo | Efficient installs, parallel builds | ✓ Good |
| Soft deletes for guests/bookings | Data preservation, audit compliance | ✓ Good |
| BullMQ for job queue | Redis-backed, reliable, good for email polling and scheduled tasks | — Pending |

---
*Last updated: 2026-02-19 after GSD initialization*
