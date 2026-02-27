# Requirements: Puppy Yoga Retreat -- Business Automation Platform

**Defined:** 2026-02-27
**Core Value:** Ines can manage her entire business from one system -- see every guest, booking, and message in one place, get AI-drafted replies she approves with one tap, and control everything via the AI assistant.

## v1.0 Requirements (Complete)

All v1.0 MVP requirements shipped. See MILESTONES.md for details.

## v1.1 Requirements (Complete)

All v1.1 requirements shipped. See MILESTONES.md for details.

## v1.2 Requirements

Requirements for milestone v1.2: Email System Improvements.

### AI Draft Fix

- [x] **DRAFT-01**: AI draft is generated for every new guest inquiry email (end-to-end pipeline working)
- [x] **DRAFT-02**: Failed draft generation surfaces an error state visible in the inbox UI

### Compose

- [ ] **COMP-01**: Ines can compose and send a new email to a guest from the dashboard
- [ ] **COMP-02**: New outbound email creates a conversation and stores the sent message

### Inbox UX

- [ ] **INBOX-01**: Ines can search conversations by guest name, email address, or message content
- [ ] **INBOX-02**: Ines can mark conversations as unread or starred
- [ ] **INBOX-03**: Ines can filter conversations by status (open/closed), classification, read/unread, starred

### OTA Email

- [ ] **OTA-04**: Tripaneer/BookYogaRetreats email structure is analyzed and parser validated against real email samples
- [ ] **OTA-05**: OTA auto-created bookings include all extractable fields (guest, dates, package, price, OTA reference)
- [ ] **OTA-06**: OTA conversations are flagged as non-replyable if replies must go through the OTA platform

### WhatsApp Email Flow

- [ ] **WAEML-01**: Ines receives a WhatsApp notification when a new guest email arrives (sender, subject, preview)
- [ ] **WAEML-02**: When AI draft is ready, WhatsApp shows the full draft text to Ines
- [ ] **WAEML-03**: Ines can approve the draft from WhatsApp and it sends immediately via SMTP
- [ ] **WAEML-04**: Ines can reject the draft from WhatsApp (triggers regeneration or marks rejected)
- [ ] **WAEML-05**: Ines can edit the draft text from WhatsApp before approving

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
| PayPal/Stripe payment integration | Phase 2 scope -- v1.2 is email improvements only |
| OTA API integrations (GetYourGuide, Viator) | Phase 4 -- v1.2 focuses on email-based OTA parsing only |
| Email template builder | Deferred -- Ines can use AI drafts for now; templates add complexity |
| Conversation merging | Nice-to-have but not critical for v1.2 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DRAFT-01 | Phase 18 | Complete |
| DRAFT-02 | Phase 18 | Complete |
| COMP-01 | Phase 19 | Pending |
| COMP-02 | Phase 19 | Pending |
| INBOX-01 | Phase 20 | Pending |
| INBOX-02 | Phase 20 | Pending |
| INBOX-03 | Phase 20 | Pending |
| OTA-04 | Phase 21 | Pending |
| OTA-05 | Phase 21 | Pending |
| OTA-06 | Phase 21 | Pending |
| WAEML-01 | Phase 22 | Pending |
| WAEML-02 | Phase 22 | Pending |
| WAEML-03 | Phase 22 | Pending |
| WAEML-04 | Phase 22 | Pending |
| WAEML-05 | Phase 22 | Pending |

**Coverage:**
- v1.2 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after roadmap creation*
