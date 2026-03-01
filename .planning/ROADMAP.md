# Roadmap: PYR Inbox & AI Pipeline Rework

## Overview

Replace the rules-based email classifier and auto-creation pipeline with OpenClaw-powered agent classification. The rework follows a strict dependency chain: schema and OpenClaw artifacts first (foundation), then the async backend pipeline (the core change), then the three-tab inbox UI (visible to Ines), then testing and cleanup (validation and dead code removal). Every phase delivers a coherent, independently verifiable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Schema** - Database migration, OpenClaw classify skill, plugin tool, queue definition, and email threading resolution
- [ ] **Phase 2: Backend Classification Pipeline** - Async classify pipeline via BullMQ, email poll rework, auto-creation removal, graceful degradation
- [ ] **Phase 3: Inbox UI Rework** - Three-tab inbox, guest-match banner, pending classification state, search/filter, manual reclassification
- [ ] **Phase 4: Testing, Cleanup & Documentation** - Integration tests, gateway-down scenarios, dead code removal, full documentation

## Phase Details

### Phase 1: Foundation & Schema
**Goal**: All schema, OpenClaw artifacts, and infrastructure are in place so that classification sessions can run and write results to the database
**Depends on**: Nothing (first phase)
**Requirements**: CLSF-01, CLSF-02, PIPE-04, PIPE-06
**Success Criteria** (what must be TRUE):
  1. Prisma migration applied with new classification fields (classifiedAt, classifyJobId, guestMatchSource, otaParsedData, classificationConfidence, classificationSource, classificationMeta) and the PATCH conversations endpoint accepts classification data
  2. The `classify_email` plugin tool is registered in the OpenClaw plugin and can be called by the agent with a typed parameter schema to write classification results to the database
  3. The classify skill (`skills/classify/SKILL.md`) exists with classification instructions, category definitions, and tool usage guidance, and the `classify` hook is mapped in `openclaw.json`
  4. The `AI_CLASSIFY` BullMQ queue name is defined in shared types and the queue is instantiated in the backend worker infrastructure
  5. Email threading approach is evaluated and either preserved, improved with a library, or rewritten -- with the chosen approach working correctly for reply chains
**Plans**: TBD

Plans:
- [ ] 01-01: Schema migration and API updates
- [ ] 01-02: OpenClaw classify skill, plugin tool, and hook mapping
- [ ] 01-03: BullMQ queue infrastructure and email threading resolution

### Phase 2: Backend Classification Pipeline
**Goal**: Every inbound email is stored immediately and classified asynchronously by an OpenClaw agent session, with all auto-creation behavior removed
**Depends on**: Phase 1
**Requirements**: CLSF-03, CLSF-04, CLSF-05, CLSF-06, CLSF-07, CLSF-08, PIPE-01, PIPE-02, PIPE-03, PIPE-05
**Success Criteria** (what must be TRUE):
  1. When a new email arrives via IMAP polling, it is stored in the database immediately (with classification: null) and a classify job is enqueued -- the poll loop never blocks on classification
  2. The classify worker runs an OpenClaw agent session that classifies the email (conversation / OTA / other), matches it to an existing guest via `search_guests`, detects language (EN/DE), and extracts guest info (name, phone, dates, dietary needs)
  3. No automatic guest creation, no automatic draft generation, and no automatic OTA booking creation occurs anywhere in the email pipeline
  4. When the OpenClaw gateway is unavailable, classification jobs retry with exponential backoff and conversations show a failed classification state after retries are exhausted -- manual classification remains available as fallback
**Plans**: TBD

Plans:
- [ ] 02-01: Email poll worker rework (store-then-enqueue, remove auto-creation)
- [ ] 02-02: Classify worker and OpenClaw agent session runner
- [ ] 02-03: Graceful degradation and draft generator verification

### Phase 3: Inbox UI Rework
**Goal**: Ines sees a three-tab inbox that reflects AI classification results, can create guests from unmatched emails with one click, and can search, filter, and manually reclassify conversations
**Depends on**: Phase 2
**Requirements**: INBX-01, INBX-02, INBX-03, INBX-04, INBX-05
**Success Criteria** (what must be TRUE):
  1. The inbox displays three tabs (Conversations, OTA, Other) filtering conversations by their AI classification, with correct counts per tab
  2. Conversations awaiting classification show a spinner/pending badge, and classification results appear within seconds via React Query polling without page refresh
  3. Unmatched guest conversations display an inline banner ("No matching guest -- Create [Name] [Email]?") with a one-click button that creates the guest record and links it to the conversation
  4. Manual reclassification moves a conversation between tabs immediately, and late-arriving async classification results do not overwrite a manual reclassification
  5. Each tab supports search and filtering by guest name, email, subject, and status
**Plans**: TBD

Plans:
- [ ] 03-01: Three-tab inbox layout and classification state display
- [ ] 03-02: Guest-match banner, manual reclassification, and search/filter

### Phase 4: Testing, Cleanup & Documentation
**Goal**: The new pipeline is validated with comprehensive tests, dead code is removed, and the system is fully documented
**Depends on**: Phase 3
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. Integration tests run against a live OpenClaw instance covering the full email-arrive -> classify -> guest-link -> draft pipeline
  2. Unit tests cover classification job processing, error handling, retry logic, and edge cases
  3. Frontend tests verify three-tab inbox rendering, tab switching, pending classification state, and guest banner interaction
  4. Gateway-down scenario is tested end-to-end: emails are stored, classification retries exhaust, failed state is displayed, and manual classification works as fallback
  5. Documentation covers the OpenClaw classification skill design, pipeline architecture, API changes, and operational runbook
**Plans**: TBD

Plans:
- [ ] 04-01: Backend integration and unit tests
- [ ] 04-02: Frontend tests, dead code removal, and documentation

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Schema | 0/3 | Not started | - |
| 2. Backend Classification Pipeline | 0/3 | Not started | - |
| 3. Inbox UI Rework | 0/2 | Not started | - |
| 4. Testing, Cleanup & Documentation | 0/2 | Not started | - |
