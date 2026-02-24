# Requirements: Puppy Yoga Retreat -- Business Automation Platform

**Defined:** 2026-02-19
**Core Value:** Ines can manage her entire business from one system -- see every guest, booking, and message in one place, get AI-drafted replies she approves with one tap, and control everything via the AI assistant.

## v1.0 Requirements (Complete)

All v1.0 MVP requirements shipped. See MILESTONES.md for details.

### Email Ingestion

- [x] **EMAIL-01**: System connects to any IMAP email provider (configurable host, port, credentials via admin settings)
- [x] **EMAIL-02**: System polls inbox via BullMQ scheduled job (2-3 min interval) and ingests new messages
- [x] **EMAIL-03**: System parses email content (plain text + HTML) using mailparser with MIME handling
- [x] **EMAIL-04**: System threads conversations using In-Reply-To and References headers (RFC 5322)
- [x] **EMAIL-05**: System auto-matches sender email to existing CRM guest or creates new guest record
- [x] **EMAIL-06**: System classifies incoming emails into categories: guest inquiry, OTA notification, spam/newsletter, admin/system
- [x] **EMAIL-07**: System sends outbound emails via configurable SMTP with correct threading headers preserved
- [x] **EMAIL-08**: Unified inbox UI shows conversations with live email data, sorted by latest message
- [x] **EMAIL-09**: AI draft is auto-generated for guest inquiry emails with conversation context
- [x] **EMAIL-10**: Ines can approve, edit, or reject AI drafts from the inbox UI -- approved drafts send immediately
- [x] **EMAIL-11**: Admin settings page allows configuring email provider (IMAP host/port/user/pass, SMTP host/port/user/pass)

### OTA Email Parsing

- [x] **OTA-01**: System identifies Tripaneer/BookYogaRetreats booking notification emails by sender/subject patterns
- [x] **OTA-02**: System extracts structured booking data (guest name, dates, package) from OTA notification emails
- [x] **OTA-03**: System auto-creates booking records and links to guest from parsed OTA emails

### AI Communication Engine

- [x] **AI-01**: System prompt includes business context injection: guest CRM data, conversation history, current availability, pricing, upcoming events, brand voice guidelines
- [x] **AI-02**: LLM integration supports Claude API (primary) and OpenAI (fallback) with model-agnostic abstraction layer
- [x] **AI-03**: Every AI call logs token usage and estimated cost
- [x] **AI-04**: Admin can manage FAQ entries (question/answer pairs, categorized) that are injected into AI context
- [x] **AI-05**: System classifies incoming messages for edge cases (complaints, medical/dietary requests, cancellations, adoption inquiries) and flags for priority manual handling
- [x] **AI-06**: System prompt prefix is cached (Anthropic prompt caching) for cost optimization

### Calendar Sync

- [x] **CAL-01**: System pushes booking events to Apple Calendar via CalDAV (one-way: DB -> Calendar)
- [x] **CAL-02**: System pushes standalone events to Apple Calendar via CalDAV
- [x] **CAL-03**: Calendar events include guest name, room assignment, dietary info, arrival time in description
- [x] **CAL-04**: When a booking is updated (room change, dietary change, payment received), the corresponding calendar event is automatically updated
- [x] **CAL-05**: When a booking or event is cancelled, the corresponding calendar event is deleted

### AI Assistant (OpenClaw)

- [x] **ASST-01**: OpenClaw is integrated as the AI assistant runtime, running self-hosted on the same server
- [x] **ASST-02**: Chat interface is available in the admin dashboard (WebChat channel)
- [x] **ASST-03**: WhatsApp connectivity via OpenClaw messaging integration
- [x] **ASST-04**: Assistant uses Claude tool-use to query business data (bookings, guests, availability, revenue, today's schedule)
- [x] **ASST-05**: Assistant can take actions with confirmation flow (create bookings, create events, send payment reminders) -- Ines confirms before execution
- [x] **ASST-06**: Morning briefing delivered at configurable time (default 7:30 AM): today's check-ins/outs, events, pending inquiries, yesterday's revenue
- [x] **ASST-07**: Proactive alerts sent via assistant: new booking received, payment confirmed, guest arriving tomorrow, overdue invoice
- [x] **ASST-08**: AI email drafts can be reviewed and approved directly from the assistant chat ("Reply OK to send")
- [x] **ASST-09**: Assistant can trigger overdue invoice reminders on request
- [x] **ASST-10**: Assistant can update existing guests, bookings, events, and conversations via natural language with confirmation flow
- [x] **ASST-11**: Assistant can delete/cancel guests (soft delete), bookings (cancel), and events (hard delete) with confirmation flow
- [x] **ASST-12**: Assistant can merge duplicate guests and register guests for events via confirmation flow
- [x] **ASST-13**: Assistant can update non-sensitive application settings directly (no confirmation needed for safe, reversible settings)

### Architecture & Modularity

- [x] **ARCH-01**: Each integration (email, AI, calendar, assistant) is a self-contained module with clean interfaces -- lego-block composability
- [x] **ARCH-02**: BullMQ queue infrastructure is a shared service plugin that all background workers consume
- [x] **ARCH-03**: AI engine exposes a simple interface (generateDraft, classifyMessage) that email and assistant modules consume independently

### Testing & Documentation

- [x] **TEST-01**: Integration tests cover email ingestion pipeline (IMAP -> parse -> thread -> classify -> store)
- [x] **TEST-02**: Integration tests cover AI draft generation (context injection -> LLM call -> draft stored)
- [x] **TEST-03**: Email threading verified against Gmail, Outlook, and Apple Mail clients
- [x] **TEST-04**: CalDAV sync tested with real iCloud account (create, update, delete events)
- [x] **DOC-01**: Each new module has an ARCHITECTURE.md or README documenting its purpose, interfaces, and configuration
- [x] **DOC-02**: API endpoints for new modules are documented in Swagger with examples
- [x] **DOC-03**: OpenClaw integration documented with setup instructions and skill definitions

## v1.1 Requirements

Requirements for milestone v1.1: Multi-Guest Bookings, Payments & Chat History.

### Multi-Guest Bookings

- [ ] **MBOOK-01**: Ines can assign multiple guests to a single booking
- [ ] **MBOOK-02**: Ines can see all guests on a booking's detail page
- [ ] **MBOOK-03**: Ines can search/filter bookings by any guest on the booking
- [ ] **MBOOK-04**: Calendar events display all guest names for a booking
- [ ] **MBOOK-05**: Ines can create a multi-guest booking via the AI assistant

### Payment Tracking

- [ ] **PAY-01**: Ines can log a payment for a booking (date, amount, method, notes)
- [ ] **PAY-02**: Ines can view payment history on a booking's detail page
- [ ] **PAY-03**: Ines can see the balance (total / paid / due) on a booking
- [ ] **PAY-04**: Balance is color-coded: green=paid, amber=partial, red=unpaid
- [ ] **PAY-05**: Ines can modify a booking's total price from the dashboard
- [ ] **PAY-06**: Ines can delete an erroneous payment entry
- [ ] **PAY-07**: Booking list shows payment status column (Paid/Partial/Unpaid)
- [ ] **PAY-08**: Ines can query and log payments via the AI assistant

### Chat History

- [x] **CHAT-01**: Assistant chat session persists across page refreshes
- [x] **CHAT-02**: Chat messages display after page refresh (localStorage)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Multi-Channel Messaging

- **MSG-01**: Instagram DM integration via Meta Graph API
- **MSG-02**: Signal messaging via OpenClaw
- **MSG-03**: iMessage integration via OpenClaw + BlueBubbles

### Advanced AI

- **ADV-00**: Automatic language detection (EN/DE) for incoming messages with response in same language
- **ADV-01**: AI-generated social media post drafts
- **ADV-02**: Guest follow-up automation (thank-you emails, review requests, return-visit offers)
- **ADV-03**: Sentiment analysis on guest messages for satisfaction tracking

### Website Booking

- **BOOK-01**: Embeddable React booking widget for WordPress site
- **BOOK-02**: PayPal Checkout SDK integration for online payments
- **BOOK-03**: PayPal Invoicing API for bank transfer bookings
- **BOOK-04**: Booking confirmation emails with branded templates

### Accounting

- **ACCT-01**: Revenue tracking by channel with OTA commission calculations
- **ACCT-02**: Expense categorization and P&L reports
- **ACCT-03**: Month-over-month revenue comparison

### Chat Enhancements

- **CHAT-03**: Ines can browse/view previous chat conversations (session list)
- **CHAT-04**: Chat sessions have human-readable names
- **CHAT-05**: Server-side chat persistence in PostgreSQL

### Payment Enhancements

- **PAY-09**: Payment type field (deposit/balance/full) for cleaner reporting
- **PAY-10**: Payment due date reminders (Phase 2 PayPal invoicing scope)
- **PAY-11**: Per-guest payment splitting within a group booking

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-user / multi-tenancy | Single admin (Ines) -- not needed for MVP or foreseeable future |
| Mobile native app | Web dashboard is sufficient; OpenClaw handles mobile via WhatsApp |
| Two-way calendar sync | DB is the source of truth; reading from Apple Calendar would create conflicts |
| Auto-send AI drafts | Human approval is a core business rule -- AI drafts must never auto-send |
| PayPal/Stripe payment integration | Phase 2 scope -- v1.1 is manual logging only |
| Invoice generation workflow | Phase 2 scope -- auto-invoice deferred |
| Lead guest / primary guest concept | All guests equal per user requirement; no hierarchy needed |
| Full LLM context replay on session restore | Expensive, complex, unnecessary for daily workflow tool |
| Per-guest payment splitting | Single totalPrice per booking; Ines invoices the group, not individuals |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 1 | Complete |
| ARCH-02 | Phase 1 | Complete |
| EMAIL-01 | Phase 2 | Complete |
| EMAIL-02 | Phase 2 | Complete |
| EMAIL-03 | Phase 2 | Complete |
| EMAIL-04 | Phase 2 | Complete |
| EMAIL-05 | Phase 2 | Complete |
| EMAIL-06 | Phase 2 | Complete |
| EMAIL-07 | Phase 2 | Complete |
| TEST-01 | Phase 2 | Complete |
| TEST-03 | Phase 2 | Complete |
| EMAIL-08 | Phase 3 | Complete |
| EMAIL-11 | Phase 3 | Complete |
| OTA-01 | Phase 3 | Complete |
| OTA-02 | Phase 3 | Complete |
| OTA-03 | Phase 3 | Complete |
| AI-01 | Phase 4 | Complete |
| AI-02 | Phase 4 | Complete |
| AI-03 | Phase 4 | Complete |
| AI-05 | Phase 4 | Complete |
| AI-06 | Phase 4 | Complete |
| ARCH-03 | Phase 4 | Complete |
| EMAIL-09 | Phase 5 | Complete |
| EMAIL-10 | Phase 5 | Complete |
| AI-04 | Phase 5 | Complete |
| TEST-02 | Phase 5 | Complete |
| CAL-01 | Phase 6 | Complete |
| CAL-02 | Phase 6 | Complete |
| CAL-03 | Phase 6 | Complete |
| CAL-04 | Phase 6 | Complete |
| CAL-05 | Phase 6 | Complete |
| TEST-04 | Phase 6 | Complete |
| ASST-01 | Phase 7 | Complete |
| ASST-02 | Phase 7 | Complete |
| ASST-03 | Phase 7 | Complete |
| ASST-04 | Phase 7 | Complete |
| ASST-05 | Phase 8 | Complete |
| ASST-06 | Phase 8 | Complete |
| ASST-07 | Phase 8 | Complete |
| ASST-08 | Phase 8 | Complete |
| ASST-09 | Phase 8 | Complete |
| DOC-01 | Phase 11 | Complete |
| DOC-02 | Phase 11 | Complete |
| DOC-03 | Phase 11 | Complete |
| ASST-10 | Phase 11 | Complete |
| ASST-11 | Phase 11 | Complete |
| ASST-12 | Phase 11 | Complete |
| ASST-13 | Phase 11 | Complete |
| CHAT-01 | Phase 12 | Complete |
| CHAT-02 | Phase 12 | Complete |
| MBOOK-01 | Phase 13 | Pending |
| MBOOK-03 | Phase 13 | Pending |
| MBOOK-04 | Phase 13 | Pending |
| PAY-01 | Phase 14 | Pending |
| PAY-05 | Phase 14 | Pending |
| PAY-06 | Phase 14 | Pending |
| PAY-07 | Phase 14 | Pending |
| MBOOK-02 | Phase 15 | Pending |
| PAY-02 | Phase 15 | Pending |
| PAY-03 | Phase 15 | Pending |
| PAY-04 | Phase 15 | Pending |
| MBOOK-05 | Phase 16 | Pending |
| PAY-08 | Phase 16 | Pending |

**Coverage:**
- v1.0 requirements: 48 total (all complete)
- v1.1 requirements: 15 mapped, 0 unmapped
- v2 requirements: 17 total (all deferred)
- Unmapped: 0

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-24 after v1.1 roadmap creation*
