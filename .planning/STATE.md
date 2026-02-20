# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Ines can manage her entire business from one system -- see every guest, booking, and message in one place, get AI-drafted replies she approves with one tap, and control everything via the AI assistant.
**Current focus:** Phase 3 - Email UI & OTA Parsing

## Current Position

Phase: 3 of 9 (Email UI & OTA Parsing)
Plan: 2 of 3 in current phase
Status: In Progress
Last activity: 2026-02-20 -- Completed 03-02-PLAN.md (Email Provider Settings)

Progress: [▓▓▓▓▓▓░░░░] 27%

## Performance Metrics

**Velocity:**
- Total plans completed: 10
- Average duration: 7min
- Total execution time: 1.08 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-queue-module-foundation | 2/2 | 15min | 7.5min |
| 02-email-ingestion-pipeline | 6/6 | 34min | 5.7min |
| 03-email-ui-ota-parsing | 2/3 | 20min | 10min |

**Recent Trend:**
- Last 5 plans: 2min, 12min, 6min, 11min, 9min
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Sequential execution (no parallelization) -- phases run 1 through 9 in order
- [Roadmap]: Email pipeline before AI engine -- email is highest-value integration, AI engine builds on it
- [Roadmap]: OpenClaw replaces Telegram/grammY as AI assistant runtime -- dashboard chat + WhatsApp channels
- [Roadmap]: Email provider configurable (not hardcoded to GMX) -- IMAP/SMTP settings via admin UI
- [Roadmap]: Language detection deferred to v2 -- not in current scope
- [Roadmap]: Testing embedded in feature phases -- no standalone testing phase, each phase verifies its own functionality
- [01-01]: Workers get own Redis connections (BRPOPLPUSH isolation) -- queues share app.redis
- [01-01]: Queue infrastructure skipped in NODE_ENV=test -- avoids Redis worker deps in unit tests
- [01-01]: Placeholder processors throw descriptive errors -- accidental triggers fail loudly to DLQ
- [01-01]: Health check interval from settings table (300s default) -- admin-configurable scheduling
- [01-02]: Module contracts define WHAT (public API surface), not HOW -- stubs throw "Not implemented" for later phases
- [01-02]: Bull Board embedded via iframe with Next.js rewrite proxy to avoid CORS
- [01-02]: Queues nav item after Settings in sidebar -- admin tool, first-class citizen
- [02-01]: Connect-per-poll IMAP strategy -- fresh ImapFlow client each cycle, avoids stale GMX connections
- [02-01]: Partial unique index on message_id WHERE NOT NULL -- email deduplication without affecting non-email messages
- [02-01]: 100-message cap per IMAP poll -- prevents memory issues on initial large inbox sync
- [02-01]: Conversation.guestId nullable -- OTA/spam/system emails stored without guest linkage
- [02-02]: sanitize-html strict allowlist -- only http/https/mailto schemes, blocks javascript:/data: URLs
- [02-02]: References checked newest-first -- most recent ancestor is most likely match in DB
- [02-02]: Forwarded emails (Fwd:/Fw:) always force new conversation creation
- [02-02]: References chain capped at 20 entries -- prevents unbounded header growth
- [02-03]: Classification priority order: OTA domains (0.95) > system senders (0.9) > spam senders (0.8) > default guest_inquiry (0.6)
- [02-03]: isSystemSender combines OTA + spam + system patterns for single-call non-guest detection
- [02-03]: vi.mock paths resolve relative to test file, not module under test -- use ../../../lib/audit.js from __tests__/
- [02-04]: No retry logic in SMTP service -- caller or BullMQ handles retries, service is send-and-report
- [02-04]: Transporter created once in factory -- nodemailer handles connection pooling internally
- [02-05]: Dynamic imports in email-poll.job.ts and inbox.routes.ts -- avoids vitest singleFork module cache pollution
- [02-05]: Email module lazily initialized per job processor lifecycle -- not per-poll, avoids redundant SMTP transporter creation
- [02-05]: updateConversation generalizes updateConversationStatus -- both status and classification updated atomically
- [02-05]: Email signature loaded from settings table per outbound email -- configurable via admin UI
- [02-06]: Pipeline integration tests use in-memory mock Prisma with array-backed stores -- avoids DB dependency while exercising real logic
- [02-06]: runPipeline test harness mirrors orchestration loop with injected raw emails instead of IMAP
- [03-01]: Sandboxed iframe with DOMPurify for HTML email rendering -- CSP blocks scripts, sandbox allows popups for links
- [03-01]: Attachment data stored as Bytes in PostgreSQL -- avoids external file storage complexity for MVP
- [03-01]: isRead defaults to true on Conversation -- existing conversations don't retroactively appear unread
- [03-01]: 30-second refetchInterval on conversations and unread count -- balances freshness vs server load
- [03-01]: Mark conversation as read atomically in same transaction as fetch
- [03-02]: JWT_SECRET as encryption key source via scrypt derivation -- single secret for MVP
- [03-02]: Dynamic import of ImapFlow/nodemailer in test-connection route -- avoids loading email deps in settings tests
- [03-02]: SMTP service lazily recreated only when config changes -- avoids redundant transporter creation
- [03-02]: Signature stored as HTML object { html: string } with backward compat for { text: string }

### Pending Todos

None yet.

### Blockers/Concerns

- Anthropic SDK needs version bump (0.39 -> 0.77) for betaZodTool/toolRunner APIs -- Phase 4
- iCloud CalDAV has undocumented quirks -- test with real account early in Phase 6
- GMX SMTP rate limits unknown -- test during Phase 2 development

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 03-02-PLAN.md
Resume file: .planning/phases/03-email-ui-ota-parsing/03-03-PLAN.md
