# Roadmap: Puppy Yoga Retreat — Business Automation Platform

## Milestones

- v1.0 MVP — Phases 1-11 (shipped 2026-02-24). See milestones/v1.0-ROADMAP.md.
- v1.1 Multi-Guest Bookings, Payments & Chat History — Phases 12-17 (shipped 2026-02-27). See milestones/v1.1-ROADMAP.md.
- v1.2 Email System Improvements — Phases 18-22 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

<details>
<summary>v1.0 MVP (Phases 1-11) — SHIPPED 2026-02-24</summary>

- [x] Phase 1: Foundation & Infrastructure (2/2 plans)
- [x] Phase 2: Email Ingestion Pipeline (6/6 plans)
- [x] Phase 3: Email UI & OTA Parsing (3/3 plans)
- [x] Phase 4: AI Communication Engine (4/4 plans)
- [x] Phase 5: AI-Email Integration (4/4 plans)
- [x] Phase 6: CalDAV Calendar Sync (4/4 plans)
- [x] Phase 7: OpenClaw Assistant Core (2/2 plans)
- [x] Phase 8: Assistant Actions & Automation (2/2 plans)
- [x] Phase 8.1: Integration Fixes & Verification (2/2 plans) (INSERTED)
- [x] Phase 11: Documentation, OTA Alert Fix (4/4 plans)

See milestones/v1.0-ROADMAP.md for full details.

</details>

<details>
<summary>v1.1 Multi-Guest Bookings, Payments & Chat History (Phases 12-17) — SHIPPED 2026-02-27</summary>

- [x] Phase 12: Schema Migration & Chat History (2/2 plans) — 2026-02-24
- [x] Phase 13: Backend Multi-Guest Bookings (2/2 plans) — 2026-02-24
- [x] Phase 14: Backend Payment Tracking (2/2 plans) — 2026-02-24
- [x] Phase 15: Frontend Multi-Guest & Payments (3/3 plans) — 2026-02-24
- [x] Phase 16: Assistant Integration (2/2 plans) — 2026-02-25
- [x] Phase 17: Edit Booking UI Triggers (1/1 plan) — 2026-02-25

See milestones/v1.1-ROADMAP.md for full details.

</details>

### v1.2 Email System Improvements (In Progress)

**Milestone Goal:** Make the email system production-ready -- fix AI draft generation, add compose capability, improve inbox UX, validate OTA auto-booking, and enable WhatsApp-based email draft approval so Ines can manage emails from her phone.

- [ ] **Phase 18: AI Draft Pipeline Fix** - Fix end-to-end AI draft generation and surface errors in the UI
- [ ] **Phase 19: Compose New Emails** - Enable composing and sending new outbound emails from the dashboard
- [ ] **Phase 20: Inbox UX Improvements** - Add search, unread/starred, and filtering to the inbox
- [ ] **Phase 21: OTA Email Analysis & Validation** - Analyze Tripaneer/BYR email structure, validate parsers, flag non-replyable OTA conversations
- [ ] **Phase 22: WhatsApp Email Notifications & Draft Approval** - Notify Ines of new emails via WhatsApp and let her review/approve/reject/edit AI drafts from her phone

## Phase Details

### Phase 18: AI Draft Pipeline Fix
**Goal**: AI drafts are reliably generated for incoming guest emails and failures are visible
**Depends on**: Nothing (first phase of v1.2 -- bug fix, unblocks Phase 22)
**Requirements**: DRAFT-01, DRAFT-02
**Success Criteria** (what must be TRUE):
  1. When a new guest inquiry email arrives, an AI draft reply appears in the inbox conversation within 30 seconds
  2. If draft generation fails (LLM error, timeout, WebSocket disconnect), the conversation shows an error state with a retry option
  3. The draft generation pipeline works end-to-end: IMAP poll -> message stored -> draft requested via WebSocket -> draft saved to ai_drafts table -> visible in UI
**Plans**: 2

Plans:
- [x] 18-01: Fix pipeline bugs (dedup, timeout, logging) and add manual draft trigger endpoint
- [ ] 18-02: Surface draft generation status and errors in inbox UI

### Phase 19: Compose New Emails
**Goal**: Ines can start new email conversations with guests from the dashboard
**Depends on**: Phase 18 (working email send infrastructure)
**Requirements**: COMP-01, COMP-02
**Success Criteria** (what must be TRUE):
  1. Ines can open a compose dialog, select or enter a guest recipient, write a subject and body, and send the email
  2. Sending a new email creates a conversation record and stores the outbound message in the messages table
  3. The new conversation appears in the inbox list immediately after sending
**Plans**: TBD

Plans:
- [ ] 19-01: TBD
- [ ] 19-02: TBD

### Phase 20: Inbox UX Improvements
**Goal**: Ines can efficiently find, organize, and filter conversations in the inbox
**Depends on**: Phase 18 (stable inbox foundation)
**Requirements**: INBOX-01, INBOX-02, INBOX-03
**Success Criteria** (what must be TRUE):
  1. Ines can type a search query and find conversations by guest name, email address, or message content
  2. Ines can mark a conversation as unread (bold in list) or starred (pinned/highlighted)
  3. Ines can filter the conversation list by status (open/closed), classification, read/unread, and starred -- filters are combinable
  4. Search and filter results update the conversation list in real time without a full page reload
**Plans**: TBD

Plans:
- [ ] 20-01: TBD
- [ ] 20-02: TBD

### Phase 21: OTA Email Analysis & Validation
**Goal**: OTA booking emails from Tripaneer/BookYogaRetreats are correctly parsed and auto-bookings contain all available data
**Depends on**: Phase 18 (working email pipeline for testing)
**Requirements**: OTA-04, OTA-05, OTA-06
**Success Criteria** (what must be TRUE):
  1. Tripaneer and BookYogaRetreats email structures are documented with real sample analysis, and parsers are validated against those samples
  2. Auto-created OTA bookings include guest name, email, check-in/check-out dates, package type, price, and OTA reference ID where extractable
  3. OTA conversations where replies must go through the OTA platform (not direct email) are flagged as non-replyable in the inbox UI
**Plans**: TBD

Plans:
- [ ] 21-01: TBD
- [ ] 21-02: TBD

### Phase 22: WhatsApp Email Notifications & Draft Approval
**Goal**: Ines can manage email drafts entirely from WhatsApp on her phone -- get notified, review, approve, reject, or edit drafts without opening the dashboard
**Depends on**: Phase 18 (working draft generation is prerequisite for draft approval flow)
**Requirements**: WAEML-01, WAEML-02, WAEML-03, WAEML-04, WAEML-05
**Success Criteria** (what must be TRUE):
  1. When a new guest email arrives, Ines receives a WhatsApp message with the sender name, subject line, and a short preview of the email body
  2. When an AI draft is ready, Ines receives the full draft text on WhatsApp so she can read it without opening the dashboard
  3. Ines can approve the draft from WhatsApp (e.g., reply "approve" or tap a button) and it sends immediately via SMTP
  4. Ines can reject the draft from WhatsApp, which either triggers regeneration or marks it as rejected in the system
  5. Ines can send an edited version of the draft text from WhatsApp, which replaces the draft content before sending
**Plans**: TBD

Plans:
- [ ] 22-01: TBD
- [ ] 22-02: TBD
- [ ] 22-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 18 -> 19 -> 20 -> 21 -> 22

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1-11 | v1.0 | 38/38 | Complete | 2026-02-24 |
| 12-17 | v1.1 | 12/12 | Complete | 2026-02-27 |
| 18. AI Draft Pipeline Fix | v1.2 | 1/2 | In Progress | - |
| 19. Compose New Emails | v1.2 | 0/TBD | Not started | - |
| 20. Inbox UX Improvements | v1.2 | 0/TBD | Not started | - |
| 21. OTA Email Analysis & Validation | v1.2 | 0/TBD | Not started | - |
| 22. WhatsApp Email Notifications & Draft Approval | v1.2 | 0/TBD | Not started | - |
