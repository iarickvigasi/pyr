# Puppy Yoga Retreat
## Business Automation Platform

*Centralized CRM / PMS / Event & Booking Management System*
*with AI-Powered Communication, Personal AI Assistant & Multi-Platform Integration*

| | |
|---|---|
| Prepared by: | **AVA Studio** |
| Client: | **Ines Brendel / Puppy Yoga Retreat** |
| Date: | **February 2026** |

---

## 1. Executive Summary

Puppy Yoga Retreat, founded by Ines Brendel, operates a unique wellness retreat in Peyia, Paphos, Cyprus, combining yoga, meditation, and rescued puppy interaction. The business currently manages bookings, accounting, events, and multi-platform communication using manual Excel spreadsheets and repetitive copy-paste workflows across 8+ platforms and channels.

This project aims to build a custom, centralized automation platform that will serve as the single source of truth for all business operations — replacing spreadsheets with a proper CRM/PMS, unifying communication across all channels, integrating AI-assisted messaging with a personal AI assistant, and adding direct booking capabilities to the main website.

We propose an MVP-first strategy: build the core system (CRM, email ingestion, calendar, AI assistant interface) first, test it in real daily use, and then progressively connect additional platforms as API access is granted and business accounts are set up.

### Key Objectives

- **Eliminate manual Excel tracking** — centralized database for bookings, events, financials
- **Unify multi-platform communication** — single inbox for email, WhatsApp, Instagram, OTA messages
- **AI-powered message drafting with human approval** — generate contextual replies, Ines approves before sending
- **Personal AI assistant** — Ines can query bookings, get briefings, manage operations, and control the business from her phone via a conversational AI interface
- **Online booking engine on PuppyYogaRetreats.com** — direct bookings with PayPal/bank transfer payments and automated invoicing
- **Event & availability management** — create events and bookings via dashboard/AI assistant/API; Apple Calendar reflects all changes automatically

---

## 2. Current State Analysis

### 2.1 Business Overview

Puppy Yoga Retreat operates from a villa in Peyia (8560), Paphos, Cyprus, offering:

- **Residential retreats** — 4-day and 7-day packages with accommodation, yoga sessions, vegetarian meals, and puppy interaction
- **Standalone events** — Puppy Yoga Classes (90 min, rooftop), Puppy Beach Walks, Coffee/Cake/Cuddles sessions
- **Animal welfare** — all puppies are rescues; the retreat actively facilitates adoptions

### 2.2 Current Tech Stack & Pain Points

| Area | Current Tool | Pain Points |
|------|-------------|-------------|
| **Bookings** | Local Excel spreadsheets | Manual entry, no real-time sync, error-prone, no availability check |
| **Accounting** | Local Excel spreadsheets | No automation, manual reconciliation across platforms |
| **Events** | Excel + manual coordination | No calendar integration, no automated notifications |
| **Communication** | Manual across 8+ channels | Same messages typed repeatedly, huge time sink, inconsistent responses |
| **AI Messaging** | OpenAI / LLM (manual copy-paste) | No context from CRM, no approval workflow, no auto-send |
| **Website Booking** | Contact form only | No real-time availability, no payment, requires manual follow-up |

### 2.3 Communication Channels in Use

| Channel | Type | API Available? | Integration Path |
|---------|------|---------------|-----------------|
| **GMX Email** | Email (IMAP/SMTP) | Yes — IMAP/SMTP | Direct IMAP polling + SMTP send |
| **BookYogaRetreats** | OTA (by Tripaneer) | No public API for small operators | Email parsing / AI bot fallback |
| **Tripaneer** | OTA (parent of BookYogaRetreats) | Same as BookYogaRetreats | Email parsing / AI bot fallback |
| **GetYourGuide** | OTA (activities) | Yes — Supplier API (partner registration required) | Full API: availability, bookings, pricing sync |
| **Viator** | OTA (by Tripadvisor) | Yes — Supplier API v2 (kickoff meeting required) | Full API: availability, bookings, cancellations |
| **BookRetreats** | OTA (retreats) | Yes — Partner API (partner approval required) | API for listings & bookings |
| **WhatsApp** | Messenger | Yes — Business API (Meta verification required) | Meta Cloud API or BSP |
| **Instagram** | Social / DMs | Yes — Graph API (Meta verification required) | Meta Graph API for DMs, comments |

---

## 3. System Architecture

The proposed system is a custom-built, centralized platform that acts as the "brain" of the business. All channels feed into it, all data lives in it, and all outgoing communication originates from it. Ines controls the system through both a web dashboard and a personal AI assistant that she can message from her phone.

### 3.1 High-Level Architecture

```
                          INBOUND CHANNELS

  [GMX Email]  [BookYogaRetreats]  [Tripaneer]  [GetYourGuide]
  [Viator]  [BookRetreats]  [WhatsApp]  [Instagram]
                    [Website Booking Widget]

                    ↓  ↓  ↓  ↓  ↓  ↓  ↓  ↓  ↓

          ┌───────────────────────────────────────────┐
          │  MESSAGE INGESTION LAYER (Polling/Webhooks) │
          └───────────────────────────────────────────┘
                              ↓
          ┌─────────────────────────────────────────────────┐
          │          CORE PLATFORM (Custom Backend)          │
          │  [CRM] [PMS] [Calendar] [AI Engine] [Billing]   │
          │     [Unified Inbox] [Dashboard] [Invoicing]      │
          └─────────────────────────────────────────────────┘
                    ↓               ↓               ↓
          [PostgreSQL DB]   [Admin Dashboard]   [Outbound Messages]

                              ↑ ↓
                ┌─────────────────────────────────────┐
                │   PERSONAL AI ASSISTANT (Bot/API)    │
                │   Ines controls via WhatsApp /       │
                │   Telegram / Web Chat                │
                └─────────────────────────────────────┘
```

### 3.2 Core Modules

#### A. Unified Inbox & Communication Hub

All incoming messages from every channel land in a single, threaded inbox. Each conversation is linked to a guest/contact record in the CRM. The system identifies the channel, extracts key information (dates, names, requests), and prepares a context-enriched AI draft reply.

**Workflow:** Message arrives → System ingests & classifies → Links to existing guest or creates new contact → AI drafts reply with booking context → Ines reviews on app/web/WhatsApp → Approves or edits → System sends via original channel.

#### B. CRM & Guest Management

Central database of all guests/leads with full history: inquiry source, communication log, booking history, preferences, dietary needs, travel dates, adoption interest. Replaces the scattered Excel sheets.

#### C. PMS / Booking Engine

Property management module handling room inventory, availability calendar, pricing (per room type & season), and reservation lifecycle. Syncs availability to OTA platforms (where API is available) and powers the new website booking widget.

#### D. Calendar & Event System

The platform's database is the single source of truth for all events, retreats, and bookings. Events and bookings are created and managed exclusively through the platform's interfaces: the admin dashboard, the personal AI assistant, or the REST API. Apple Calendar serves as a read-only mirror — it reflects all changes from the database so Ines can see her schedule at a glance on her phone, but changes are never made from the calendar app itself.

**How it works:** Ines creates a retreat or event via the dashboard or AI assistant ("Create a Puppy Yoga event for Saturday at 10am, max 8 people") → system stores it in the database, automatically creates booking slots, sets capacity limits, opens availability on connected OTAs, updates the website → Apple Calendar is updated to reflect the new event. When a guest books, the database is updated and the calendar entry is enriched with guest details.

- **Retreat bookings** — linked to room assignments, check-in/check-out dates, guest profiles
- **Standalone events** — Puppy Yoga Classes, Beach Walks, Coffee/Cake/Cuddles with capacity tracking and waitlists
- **Calendar sync** — one-way push from database to Apple Calendar (CalDAV). Ines sees everything on her phone but manages it through the platform
- **Availability propagation** — database changes automatically sync to website widget, OTA platforms, Apple Calendar, and the AI assistant's knowledge base

#### E. AI Communication Engine

Context-aware message generation using LLM (OpenAI or Claude). Unlike the current workflow where Ines manually feeds each message into ChatGPT, the AI engine will automatically receive: the full conversation thread, guest CRM data, current availability, pricing, and business rules. It produces a ready-to-send reply that just needs approval.

#### F. Accounting & Reporting

Automated financial tracking: booking revenue by channel, commission tracking per OTA, expense categorization, and simple P&L reporting. Data feeds from bookings and payments, replacing the manual Excel accounting.

#### G. Invoicing System

Automated invoice generation integrated with PayPal Invoicing API (v2). When a guest books via bank transfer, the system creates a professional invoice with retreat details, payment terms, and bank transfer instructions. PayPal invoices include a "Pay Now" button for guests who prefer to pay online. The system tracks payment status and sends automated reminders for overdue invoices.

#### H. Personal AI Assistant

A conversational AI assistant that runs on the same server as the core platform and connects to Ines via WhatsApp, Telegram, or web chat. The assistant has full read access to the platform's data (via API) and can perform actions on Ines's behalf with confirmation. This replaces the need for Ines to log into a dashboard for routine queries and makes the entire system accessible from her phone. See Section 9 for full details.

---

## 4. Platform Integration Details

*Important note: Many of the OTA and social platform APIs require special registration processes, partner applications, kickoff meetings, or business account verification before access is granted. These processes can take days to weeks. Where API access proves too difficult or is unavailable, we will implement an AI bot fallback — an automated agent that logs into the platform's web interface and performs actions (reading messages, updating availability, confirming bookings) on Ines's behalf, mimicking manual operation.*

### 4.1 Email (GMX — IMAP/SMTP)

| Aspect | Details |
|--------|---------|
| **Protocol** | IMAP for reading (imap.gmx.net:993), SMTP for sending (mail.gmx.net:587) |
| **Integration** | Poll inbox every 1–2 min via IMAP IDLE or scheduled fetch. Parse incoming emails, extract sender, subject, body. Match to existing CRM contacts. Route new inquiries to AI for draft response. |
| **Outbound** | Send approved AI-generated replies via SMTP from the same puppyyogaretreat@gmx.de address. Maintain threading via In-Reply-To headers. |
| **Access** | No special registration needed — standard IMAP/SMTP credentials. |

### 4.2 GetYourGuide (Supplier API)

| Aspect | Details |
|--------|---------|
| **API** | GetYourGuide Supplier API via Integrator Portal (integrator.getyourguide.com) |
| **Capabilities** | Real-time availability sync, pricing updates, automatic booking import, cut-off time management, barcode/QR for vouchers |
| **Access Requirements** | Requires partner registration on the Integrator Portal. May involve a review/approval process and compliance with their API guidelines. Timelines vary. |
| **Fallback** | If API access is denied or delayed: AI bot logs into GYG supplier dashboard to sync availability and pull booking notifications automatically. |

### 4.3 Viator (Supplier API v2)

| Aspect | Details |
|--------|---------|
| **API** | Viator Supplier API v2 (docs.viator.com/supplier-api) |
| **Capabilities** | Availability & pricing APIs, booking/amendment/cancellation APIs, batch availability, product validation. Includes contract testing tool (Docker-based). |
| **Access Requirements** | Requires a mandatory kickoff meeting with Viator's team to receive API key and Supplier ID. Must pass contract testing before going live. This process can take several weeks. |
| **Fallback** | If API onboarding is slow or rejected: AI bot manages Viator supplier portal — reads bookings, updates availability, responds to customer queries. |

### 4.4 BookRetreats (Partner API)

| Aspect | Details |
|--------|---------|
| **API** | BookRetreats Wellness Retreats API (JSON/XML), available on RapidAPI |
| **Capabilities** | Real-time availability, fully automated booking processes, listing management |
| **Access Requirements** | Requires authorized partner approval. Application process through BookRetreats directly. Approval timelines unclear. |
| **Fallback** | AI bot monitors BookRetreats dashboard for new inquiries and booking notifications; syncs data back to the platform. |

### 4.5 BookYogaRetreats / Tripaneer

| Aspect | Details |
|--------|---------|
| **API** | No public supplier API available for small operators |
| **Primary Method** | Parse booking notification emails from Tripaneer (they send structured emails for each inquiry/booking). Extract guest data, dates, and booking details via email rules. |
| **Fallback** | AI bot logs into Tripaneer admin panel to check for new messages, update calendar/availability, and manage listings. If an iCal feed becomes available, integrate that for real-time sync. |

### 4.6 WhatsApp Business API

| Aspect | Details |
|--------|---------|
| **API** | Meta WhatsApp Cloud API (direct) or via BSP like Twilio, WATI, or 360dialog |
| **Capabilities** | Send/receive messages, pre-approved templates for outbound, rich media (images, documents), automated replies, 24-hour customer service window for free-form replies |
| **Access Requirements** | Requires Meta Business verification (5–20 business days), approved WhatsApp Business account, message template approval for outbound messages. Also needs a dedicated phone number. |
| **Fallback** | If Meta verification is delayed: the personal AI assistant can be connected to Ines's personal WhatsApp via linked device pairing, allowing basic message monitoring and alerts without the Business API. |

### 4.7 Instagram (Messaging API)

| Aspect | Details |
|--------|---------|
| **API** | Meta Instagram Graph API (Messenger API for Instagram) |
| **Capabilities** | Send/receive DMs, automated replies to comments/story mentions, keyword triggers, rich media, handoff to human agents |
| **Access Requirements** | Instagram Business/Creator account linked to Facebook Page. Requires Facebook Business verification and App Review. Same Meta verification pipeline as WhatsApp. |
| **Fallback** | If Meta API access is delayed: AI bot monitors Instagram DMs via browser automation, flags new messages, and drafts replies for Ines to send manually. |

### 4.8 Website Booking Widget (PuppyYogaRetreats.com)

| Aspect | Details |
|--------|---------|
| **Current** | WordPress site with simple contact form (no booking/payment capability) |
| **Technology** | Embeddable React/JS widget connecting to our backend API. Deployed as a standalone component embedded into the existing WordPress site via iframe or script tag. |
| **Payment Options** | PayPal (online payment via PayPal Checkout SDK) + Direct Bank Transfer (SEPA). For bank transfers, system generates a PayPal invoice with payment link and bank details. |
| **Invoicing** | Automated via PayPal Invoicing REST API (v2): create draft invoice → send to guest email with Pay Now button → track payment status via webhooks → record offline payments (bank transfer). Supports QR codes, payment reminders, and custom templates with retreat branding. |
| **Guest Flow** | Select room type → Pick check-in & check-out dates → Optionally extend stay (add extra nights) → System shows real-time availability & total price → Fill guest details (name, email, dietary, arrival info) → Choose payment method (PayPal or bank transfer) → Pay online or receive invoice → Booking confirmed → Confirmation email + WhatsApp sent → CRM updated, Apple Calendar synced. |
| **Key Features** | Room selection with photos & descriptions, interactive date picker with availability overlay, stay extension capability (add extra nights after initial selection), real-time pricing based on room type + season + duration, multi-language support (EN/DE). |
| **Access** | No special registration needed — we control the website and backend. Requires PayPal Premier or Business account for Invoicing API. |

---

## 5. AI Communication Engine

### 5.1 How It Works

The current workflow has Ines manually copying messages into ChatGPT, tweaking the output, and pasting it back into each platform. The new system automates this entirely:

1. **Message arrives** from any channel into the unified inbox
2. **System enriches context:** guest history, current availability, pricing, previous conversations, business rules, FAQ knowledge base
3. **AI generates a draft reply** in the correct language (EN/DE based on guest), matching the brand tone
4. **Ines receives notification** (push notification, WhatsApp via AI assistant, or dashboard) with the draft
5. **One-tap approve or quick edit** — approve sends immediately, edit opens inline editor
6. **System sends reply** via the original channel (email, WhatsApp, Instagram, etc.)

### 5.2 AI Context Injection

Each AI call includes a structured system prompt with: business description, current retreat dates & availability, room types & pricing, FAQ answers (cancellation policy, what to bring, airport transfers, etc.), brand voice guidelines (warm, mindful, animal-welfare focused), and the guest's full CRM profile and conversation history.

### 5.3 Approval Interface Options

- **Web dashboard** — full-featured inbox with conversation threads, AI drafts shown inline with approve/edit buttons
- **AI assistant on WhatsApp** — the personal AI assistant sends Ines the draft via WhatsApp; she replies "OK" to approve or edits the message. Lowest friction for on-the-go approval.
- **Mobile PWA** — progressive web app with push notifications, optimized for phone use

---

## 6. Proposed Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Backend** | Node.js (Express/Fastify) or Python (FastAPI) | Fast development, excellent API integration ecosystem |
| **Database** | PostgreSQL + Redis (caching) | Relational data (bookings, guests), Redis for session/queue |
| **Frontend** | React (Next.js) or Vue | Admin dashboard, booking widget, approval interface |
| **AI Engine** | OpenAI / Anthropic Claude | Multi-lingual, high-quality draft generation |
| **Email** | IMAP/SMTP (node-imap, nodemailer) | Direct GMX integration, no third-party needed |
| **WhatsApp** | Meta Cloud API or Twilio WhatsApp | Official API, reliable delivery, template support |
| **Instagram** | Meta Graph API (Messenger for IG) | Official DM API, no follower minimum |
| **Payments** | PayPal Checkout SDK + Invoicing API v2 | EU-compliant, supports EUR, built-in invoicing with Pay Now button, bank transfer recording |
| **Hosting** | Hetzner Cloud (EU) or Railway/Render | GDPR-compliant EU hosting, affordable VPS |
| **Queue/Jobs** | BullMQ (Redis-backed) | Email polling, OTA sync, scheduled tasks |
| **Calendar** | Apple Calendar (CalDAV) | One-way sync: platform pushes events to Apple Calendar for Ines to view on her phone |
| **AI Assistant** | Self-hosted agent (Node.js) on same server | Personal AI assistant with API access to the platform, connected via WhatsApp/Telegram |

---

## 7. Project Phases & Roadmap (MVP-First)

We take an MVP-first approach: build the core system that solves the biggest pain points immediately, test it in real daily use, and then progressively add channels and integrations as API access is granted.

### Phase 1: MVP — Core Platform

**CRM, email ingestion, calendar system, personal AI assistant, and admin interface.**

This phase delivers the foundation that Ines can immediately start using to run her business more efficiently. Even without OTA or social media integrations, this replaces Excel and gives her a proper system.

**A. Database & Backend**

- Design database schema (guests, bookings, rooms, events, messages, invoices)
- Build backend REST API for all core operations
- Deploy to Hetzner Cloud (EU), set up CI/CD

**B. CRM & Guest Management**

- Central guest database with contact details, inquiry source, communication log, preferences, dietary needs
- Import existing Excel data into the new database
- Search, filter, and tag guests

**C. Email Ingestion (GMX)**

- IMAP integration with GMX — poll inbox, parse emails, match to CRM contacts, thread conversations
- AI engine: system prompt with business context, draft generation, language detection
- SMTP sending with original threading headers
- Basic unified inbox in the admin dashboard (email channel only for MVP)

**D. Calendar & Event System**

- One-way sync to Apple Calendar via CalDAV — Ines sees schedule on her phone
- Ines creates retreat/event via dashboard or AI assistant → system stores in DB, creates booking slots, sets capacity
- Bookings appear on Apple Calendar with guest details, room assignment, check-in/out dates
- Event types: retreats (multi-day, room-based) and standalone events (single session, capacity-based)

**E. Personal AI Assistant**

- Self-hosted AI assistant on the same server, accessible via WhatsApp or Telegram
- Connected to the platform's REST API — can read bookings, guest data, calendar, revenue
- Ines texts questions like "How many bookings next week?", "Is Room 3 free March 15–22?", "Send me today's check-ins"
- Approval workflow: AI assistant forwards message drafts for Ines to approve by replying "OK"
- Proactive alerts: new booking received, payment confirmed, guest arriving tomorrow

**F. Admin Dashboard**

- Web-based dashboard: guest list, bookings overview, calendar view, unified inbox
- Approval UI for AI-drafted messages
- Basic reports: upcoming bookings, revenue this month, pending inquiries

> **MVP Milestone:** At the end of Phase 1, Ines has a working system that replaces her Excel sheets, gives her a proper CRM, handles email communication with AI drafts, manages events and bookings (synced to Apple Calendar), and lets her control everything from WhatsApp via the AI assistant. We test this in real daily use before proceeding.

### Phase 2: Website Booking & Payments

**Online booking widget with PayPal and bank transfer support.**

- Build embeddable React/JS booking widget (room selector, date picker, stay extension, guest form)
- PayPal Checkout SDK integration for online payments
- PayPal Invoicing API v2: automated invoice creation for bank transfer bookings, payment tracking, reminders
- Bank transfer flow: generate invoice with SEPA details → guest pays → payment recorded → booking confirmed
- Booking confirmation emails (automated, branded templates)
- Embed widget in WordPress site
- New bookings stored in DB and automatically pushed to Apple Calendar

### Phase 3: Social & Messenger Channels

**WhatsApp and Instagram integration — if business accounts are approved.**

This phase depends on Meta Business verification being completed. We start the verification process during Phase 1, and integrate as soon as access is granted.

- WhatsApp Business API setup + message templates (booking confirmation, reminders, welcome)
- Instagram DM API: webhook setup, DM ingestion, automated replies
- Both channels feed into the existing unified inbox with the same AI-draft-approve-send workflow
- **If Meta verification is delayed:** use AI bot fallback via linked device (WhatsApp) or browser automation (Instagram)

### Phase 4: OTA Integrations

**Connect GetYourGuide, Viator, BookRetreats, and Tripaneer — as API access is granted.**

We apply for API access to all OTA platforms during Phase 1. This phase implements whichever integrations have been approved. For any platform where API access is denied or stalled, we deploy the AI bot fallback.

- GetYourGuide Supplier API: availability sync, automatic booking import
- Viator Supplier API v2: availability, bookings, cancellations (requires passing contract tests)
- BookRetreats Partner API: listing sync, automated bookings
- BookYogaRetreats/Tripaneer: email-based ingestion + AI bot for admin portal management
- Central availability manager: prevent double-bookings across all connected channels

### Phase 5: Polish & Accounting

**Financial reporting, advanced features, and UX refinement.**

- Accounting module: revenue tracking by channel, OTA commission tracking, expense entry, P&L reports
- Enhanced AI assistant skills: generate weekly reports, compare month-over-month revenue, draft social media posts
- Guest follow-up automation: thank-you emails after checkout, review requests, return-visit offers
- Dashboard refinement: KPIs, occupancy rates, response time metrics, revenue charts
- Mobile-responsive admin UI optimization

---

## 8. Deliverables Summary

| # | Deliverable | Phase | Priority | Status |
|---|------------|-------|----------|--------|
| 1 | PostgreSQL database with full schema | Phase 1 (MVP) | **Critical** | Planned |
| 2 | Backend REST API | Phase 1 (MVP) | **Critical** | Planned |
| 3 | CRM & guest management module | Phase 1 (MVP) | **Critical** | Planned |
| 4 | Email integration (IMAP/SMTP) + unified inbox | Phase 1 (MVP) | **Critical** | Planned |
| 5 | AI communication engine + approval workflow | Phase 1 (MVP) | **Critical** | Planned |
| 6 | Calendar & event system (DB-driven + Apple Calendar sync) | Phase 1 (MVP) | **Critical** | Planned |
| 7 | Personal AI assistant (WhatsApp/Telegram interface) | Phase 1 (MVP) | **Critical** | Planned |
| 8 | Admin dashboard (web) | Phase 1 (MVP) | **Critical** | Planned |
| 9 | Website booking widget (React/JS) with PayPal + invoicing | Phase 2 | **Critical** | Planned |
| 10 | WhatsApp Business API integration | Phase 3 | High | Planned |
| 11 | Instagram DM API integration | Phase 3 | High | Planned |
| 12 | OTA integrations (GYG, Viator, BookRetreats, Tripaneer) | Phase 4 | Medium | Planned |
| 13 | AI bot fallback for platforms without API access | Phase 4 | Medium | Planned |
| 14 | Accounting & reporting module | Phase 5 | Medium | Planned |

---

## 9. Personal AI Assistant

A core component of the platform is a personal AI assistant that gives Ines a conversational interface to her entire business. Rather than logging into dashboards or checking multiple apps, Ines can simply text the assistant from her phone and get immediate answers, approve actions, and receive proactive updates.

### 9.1 What It Is

The assistant is a self-hosted AI agent running on the same server as the core platform. It connects to a messaging app (WhatsApp, Telegram, or web chat) and communicates with the platform's REST API to read and act on business data. It uses a large language model (OpenAI or Claude) for natural language understanding and generation, enriched with real-time data from the CRM, calendar, bookings, and inbox.

The assistant is Ines's personal tool — it is not customer-facing. Guests never interact with it. It's designed so Ines can manage her business from anywhere with just her phone and a messaging app.

### 9.2 Core Capabilities

#### Query Business Data

- *"How many bookings do we have next month?"* — queries the database and responds with a summary
- *"Is Room 3 free March 15–22?"* — checks availability in the database in real time
- *"What's our revenue this month vs last month?"* — pulls financial data and generates a comparison
- *"Who's checking in tomorrow?"* — lists guest names, room assignments, dietary needs, arrival times

#### Manage Communication

- *"Any new inquiries?"* — shows unread messages from all channels with AI-drafted replies
- *"Approve all pending drafts" or "OK"* — sends approved messages via their original channel
- *"Draft a reply to Sarah's email about extending her stay"* — generates a contextual reply for review

#### Proactive Alerts & Briefings

- **Morning briefing (scheduled)** — at 7:30 AM: today's check-ins, check-outs, events, pending inquiries, revenue yesterday
- **New booking alert** — "New booking: Sarah Miller, Room 2, March 15–22, vegan diet. Paid via PayPal."
- **Payment received** — "Bank transfer received from Anna Chang, €1,090. Invoice marked as paid."
- **Overdue invoice** — "Invoice #PYR-0042 is 5 days overdue. Send reminder?"
- **Guest arriving tomorrow** — "Reminder: Sarah Miller arrives tomorrow at 14:00. Room 2 ready? Dietary: vegan."

#### Take Actions (with confirmation)

- *"Book Room 3 for John Smith, April 1–4"* — assistant confirms details, Ines says "yes", booking created
- *"Send a payment reminder to invoice #PYR-0042"* — triggers PayPal reminder API
- *"Create a Puppy Yoga event for Saturday March 22 at 10am, max 8 people"* — creates event in the database, opens booking slots on website, pushes to Apple Calendar

### 9.3 Technical Implementation

The assistant runs as a separate Node.js process on the same server, sharing the same database connection and API layer. It connects to Ines's messaging app using the appropriate integration method (WhatsApp linked device, Telegram Bot API, or web chat). All actions go through the platform's REST API, meaning the assistant has the same permissions and audit trail as the admin dashboard.

| Aspect | Details |
|--------|---------|
| **Runs on** | Same Hetzner server as the core platform. Separate process, shared database. |
| **Messaging** | WhatsApp (linked device or Business API) / Telegram Bot API / Web Chat. Ines picks her preferred channel. |
| **AI Model** | OpenAI or Claude. Model-agnostic — can switch based on performance and cost. |
| **Data Access** | Reads from the platform's REST API (bookings, guests, calendar, inbox, financials). Write operations require Ines's explicit confirmation. |
| **Scheduled Tasks** | Cron-based: morning briefings, payment reminders, arrival notifications, overdue invoice checks. |
| **Security** | API-key authenticated. Read access by default; write operations require Ines to confirm. All actions logged. Only Ines's messaging account has access. |
| **Cost** | Only AI model API usage (~€5–50/month depending on conversation volume). No platform licensing fees. |

---

## 10. Risks & Considerations

- **OTA API access delays:** GetYourGuide, Viator, and BookRetreats each require partner registration/approval processes that can take weeks. We start applications in Phase 1 but don't block progress on them. AI bot fallback is available for any platform where access is denied or delayed.
- **Meta Business verification:** WhatsApp and Instagram APIs require Meta Business verification (5–20 days). The business needs a valid website, clear contact info, and supporting documents. We begin this process immediately.
- **GDPR compliance:** Storing guest data and communication requires proper consent management, data processing agreements, and EU-based hosting. The website already uses Real Cookie Banner.
- **AI accuracy:** AI-generated messages must always go through human approval. Edge cases (complaints, special requests, medical/dietary) should be flagged for manual handling.
- **BookYogaRetreats/Tripaneer:** No supplier API available. Email-based ingestion is the primary method. AI bot provides additional coverage for admin portal tasks.
- **WhatsApp 24-hour window:** After 24 hours of inactivity, outbound WhatsApp messages require pre-approved templates. The system must track conversation windows and fall back to templates.
- **PayPal Invoicing limitations:** Maximum 2 reminders per day per invoice. Offline bank transfer payments must be manually recorded or automated via bank statement parsing. PayPal charges standard transaction fees for PayPal payments but not for using the Invoicing API itself.
- **AI bot fallback reliability:** Browser-based automation is inherently more fragile than API integration. Platform UI changes can break bots. This is a temporary measure until proper API access is secured; bots will need monitoring and occasional maintenance.
- **Ongoing maintenance:** APIs evolve. Viator recently moved to v2, Meta updates their policies regularly. Budget for ongoing maintenance and API version upgrades.

---

## 11. Next Steps

1. **Review & approve this document** — Ines confirms scope, priorities, and any adjustments
2. **Gather credentials & access** — GMX email credentials, existing Excel files for data import, Apple ID for Calendar sync, PayPal Business account access
3. **Start API partner applications (in parallel with Phase 1)** — Register with GetYourGuide Integrator Portal, request Viator kickoff meeting, apply for BookRetreats partner access, begin Meta Business verification for WhatsApp + Instagram
4. **Define brand voice guidelines** — Collect sample messages Ines likes, define tone rules for AI engine
5. **Set up PayPal Business account** — Ensure PayPal Premier or Business account is active for Invoicing API access. Configure invoice templates with retreat branding.
6. **Begin Phase 1 (MVP) development** — Database design, CRM, email ingestion, calendar system, AI assistant

---

*Prepared by AVA Studio*
*February 2026 — Peyia, Cyprus*
