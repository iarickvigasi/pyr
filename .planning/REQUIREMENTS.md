# Requirements: PYR Inbox & AI Pipeline Rework

**Defined:** 2026-03-01
**Core Value:** Emails are correctly classified and routed by an AI agent that can reason about context, with Ines always in control of guest creation and draft sending.

## v1 Requirements

Requirements for the inbox rework. Each maps to roadmap phases.

### Classification

- [ ] **CLSF-01**: OpenClaw classify skill with classification prompt, instructions, and examples (`skills/classify/SKILL.md`)
- [ ] **CLSF-02**: New `classify_email` tool registered in OpenClaw plugin for structured classification output
- [ ] **CLSF-03**: Every inbound email triggers an OpenClaw agent classification session (conversation / OTA / other)
- [ ] **CLSF-04**: Classification agent uses `search_guests` tool to match emails to existing guest records
- [ ] **CLSF-05**: Classification agent detects language (EN/DE) from email content
- [ ] **CLSF-06**: Classification agent extracts guest info (name, phone, dates, dietary needs) from email body
- [ ] **CLSF-07**: Classification runs async via BullMQ (decoupled from email polling)
- [ ] **CLSF-08**: Graceful degradation when OpenClaw gateway is down (queue + retry, manual classify fallback)

### Inbox UI

- [ ] **INBX-01**: Three-tab inbox layout: Conversations, OTA, Other
- [ ] **INBX-02**: Inline banner for unmatched guests ("No matching guest — Create [Name] [Email]?") with one-click create
- [ ] **INBX-03**: "Pending classification" state shown while AI classifies (spinner/badge)
- [ ] **INBX-04**: Manual reclassification moves conversation between tabs immediately
- [ ] **INBX-05**: Search and filter within each tab (by guest name, email, subject, status)

### Pipeline Cleanup

- [ ] **PIPE-01**: Remove automatic guest creation from email pipeline
- [ ] **PIPE-02**: Remove automatic draft generation on email arrival
- [ ] **PIPE-03**: Remove automatic booking creation from OTA emails
- [ ] **PIPE-04**: New `ai-classify` BullMQ queue for classification jobs
- [ ] **PIPE-05**: Email polling stores messages immediately, enqueues classification separately
- [ ] **PIPE-06**: Email threading evaluated and preserved or improved

### Testing & Documentation

- [ ] **TEST-01**: Real integration tests against running OpenClaw instance (no mocks)
- [ ] **TEST-02**: Unit tests for classification job processing and error handling
- [ ] **TEST-03**: Frontend tests for three-tab inbox and guest banner
- [ ] **TEST-04**: Gateway-down scenario testing (graceful degradation verification)
- [ ] **TEST-05**: Full documentation of OpenClaw classification skill and pipeline architecture

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Draft Generation Rework

- **DRFT-01**: Draft generation triggered manually by Ines (button click, not auto)
- **DRFT-02**: Draft generation runs as full OpenClaw agent session with tool access
- **DRFT-03**: Existing draft review/edit/approve/reject flow preserved
- **DRFT-04**: Draft cost and token display preserved

### Enhanced Classification

- **CLSF-09**: Edge-case flags during classification (complaints, cancellations, medical)
- **CLSF-10**: Classification accuracy tracking (log initial vs. manual overrides)

### Enhanced Inbox

- **INBX-06**: OTA parsed data display card showing extracted booking info
- **INBX-07**: OTA guest matching suggestions ("This might be [existing guest]")

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Auto-create guests from emails | Pollutes CRM with spam senders and system addresses. Replaced by inline banner with one-click create. |
| Auto-send AI drafts | Core business rule: Ines must always approve before sending. |
| Auto-create bookings from OTA emails | OTA parsers aren't 100% accurate. Show parsed data for manual action instead. |
| Rules-based pre-filter before AI classification | User chose simplicity: all emails go through OpenClaw. One classification path. |
| Confidence score storage and display | Single admin doesn't need confidence numbers. Override with one click if wrong. |
| Real-time streaming classification results | Partial results are confusing. Show spinner then final result. |
| Bulk AI draft generation | Expensive and wasteful. One-at-a-time manual trigger when needed. |
| Multi-channel classification (WhatsApp/Instagram) | Phase 3 channel expansion. Channel field ready in schema. |
| Sentiment analysis scoring | Over-engineering for single admin. Edge-case flags cover high-stakes cases. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLSF-01 | — | Pending |
| CLSF-02 | — | Pending |
| CLSF-03 | — | Pending |
| CLSF-04 | — | Pending |
| CLSF-05 | — | Pending |
| CLSF-06 | — | Pending |
| CLSF-07 | — | Pending |
| CLSF-08 | — | Pending |
| INBX-01 | — | Pending |
| INBX-02 | — | Pending |
| INBX-03 | — | Pending |
| INBX-04 | — | Pending |
| INBX-05 | — | Pending |
| PIPE-01 | — | Pending |
| PIPE-02 | — | Pending |
| PIPE-03 | — | Pending |
| PIPE-04 | — | Pending |
| PIPE-05 | — | Pending |
| PIPE-06 | — | Pending |
| TEST-01 | — | Pending |
| TEST-02 | — | Pending |
| TEST-03 | — | Pending |
| TEST-04 | — | Pending |
| TEST-05 | — | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 0
- Unmapped: 24 ⚠️

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after initial definition*
