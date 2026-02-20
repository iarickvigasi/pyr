# Requirements: Puppy Yoga Retreat — MVP Completion

**Defined:** 2026-02-19
**Core Value:** Ines can manage her entire business from one system -- see every guest, booking, and message in one place, get AI-drafted replies she approves with one tap, and control everything via the AI assistant.

## v1 Requirements

Requirements for MVP completion. Each maps to roadmap phases.

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
- [ ] **CAL-04**: When a booking is updated (room change, dietary change, payment received), the corresponding calendar event is automatically updated
- [ ] **CAL-05**: When a booking or event is cancelled, the corresponding calendar event is deleted

### AI Assistant (OpenClaw)

- [ ] **ASST-01**: OpenClaw is integrated as the AI assistant runtime, running self-hosted on the same server
- [ ] **ASST-02**: Chat interface is available in the admin dashboard (WebChat channel)
- [ ] **ASST-03**: WhatsApp connectivity via OpenClaw messaging integration
- [ ] **ASST-04**: Assistant uses Claude tool-use to query business data (bookings, guests, availability, revenue, today's schedule)
- [ ] **ASST-05**: Assistant can take actions with confirmation flow (create bookings, create events, send payment reminders) -- Ines confirms before execution
- [ ] **ASST-06**: Morning briefing delivered at configurable time (default 7:30 AM): today's check-ins/outs, events, pending inquiries, yesterday's revenue
- [ ] **ASST-07**: Proactive alerts sent via assistant: new booking received, payment confirmed, guest arriving tomorrow, overdue invoice
- [ ] **ASST-08**: AI email drafts can be reviewed and approved directly from the assistant chat ("Reply OK to send")
- [ ] **ASST-09**: Assistant can trigger overdue invoice reminders on request

### Architecture & Modularity

- [x] **ARCH-01**: Each integration (email, AI, calendar, assistant) is a self-contained module with clean interfaces -- lego-block composability
- [x] **ARCH-02**: BullMQ queue infrastructure is a shared service plugin that all background workers consume
- [x] **ARCH-03**: AI engine exposes a simple interface (generateDraft, classifyMessage) that email and assistant modules consume independently

### Testing & Documentation

- [x] **TEST-01**: Integration tests cover email ingestion pipeline (IMAP -> parse -> thread -> classify -> store)
- [x] **TEST-02**: Integration tests cover AI draft generation (context injection -> LLM call -> draft stored)
- [x] **TEST-03**: Email threading verified against Gmail, Outlook, and Apple Mail clients
- [ ] **TEST-04**: CalDAV sync tested with real iCloud account (create, update, delete events)
- [ ] **TEST-05**: Excel data migration script imports real guest and booking data with validation
- [ ] **TEST-06**: UAT sessions with Ines covering daily workflows (email -> draft -> approve -> send, assistant queries)
- [ ] **TEST-07**: Production deployment on Hetzner with monitoring, backups, and rollback plan
- [ ] **DOC-01**: Each new module has an ARCHITECTURE.md or README documenting its purpose, interfaces, and configuration
- [ ] **DOC-02**: API endpoints for new modules are documented in Swagger with examples
- [ ] **DOC-03**: OpenClaw integration documented with setup instructions and skill definitions

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

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-user / multi-tenancy | Single admin (Ines) -- not needed for MVP or foreseeable future |
| Mobile native app | Web dashboard is sufficient; OpenClaw handles mobile via WhatsApp |
| Two-way calendar sync | DB is the source of truth; reading from Apple Calendar would create conflicts |
| Auto-send AI drafts | Human approval is a core business rule -- AI drafts must never auto-send |
| Rich HTML email editor | Plain text + simple formatting is sufficient for guest communication |
| WebSocket real-time inbox | BullMQ polling + page refresh is adequate for single-user MVP |
| IMAP IDLE as primary strategy | Polling via BullMQ is simpler and more reliable for MVP |
| OTA API integrations | Phase 4 -- requires partner registration processes |
| Browser automation fallback | Phase 4 -- for platforms without API access |

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
| CAL-04 | Phase 6 | Pending |
| CAL-05 | Phase 6 | Pending |
| TEST-04 | Phase 6 | Pending |
| ASST-01 | Phase 7 | Pending |
| ASST-02 | Phase 7 | Pending |
| ASST-03 | Phase 7 | Pending |
| ASST-04 | Phase 7 | Pending |
| ASST-05 | Phase 8 | Pending |
| ASST-06 | Phase 8 | Pending |
| ASST-07 | Phase 8 | Pending |
| ASST-08 | Phase 8 | Pending |
| ASST-09 | Phase 8 | Pending |
| TEST-05 | Phase 9 | Pending |
| TEST-06 | Phase 9 | Pending |
| TEST-07 | Phase 9 | Pending |
| DOC-01 | Phase 9 | Pending |
| DOC-02 | Phase 9 | Pending |
| DOC-03 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 47 total
- Mapped to phases: 47
- Unmapped: 0

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 -- testing requirements distributed into feature phases, Phase 9 (Integration Testing) removed, Phase 10 renumbered to Phase 9*
