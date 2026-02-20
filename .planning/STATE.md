# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Ines can manage her entire business from one system -- see every guest, booking, and message in one place, get AI-drafted replies she approves with one tap, and control everything via the AI assistant.
**Current focus:** Phase 2 - Email Ingestion Pipeline

## Current Position

Phase: 2 of 9 (Email Ingestion Pipeline)
Plan: 2 of 6 in current phase
Status: In Progress
Last activity: 2026-02-20 -- Completed 02-02-PLAN.md (Email Parsing & Threading)

Progress: [▓▓▓░░░░░░░] 12%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 6min
- Total execution time: 0.42 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-queue-module-foundation | 2/2 | 15min | 7.5min |
| 02-email-ingestion-pipeline | 2/6 | 10min | 5min |

**Recent Trend:**
- Last 5 plans: 8min, 7min, 6min, 4min
- Trend: Improving

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

### Pending Todos

None yet.

### Blockers/Concerns

- Anthropic SDK needs version bump (0.39 -> 0.77) for betaZodTool/toolRunner APIs -- Phase 4
- iCloud CalDAV has undocumented quirks -- test with real account early in Phase 6
- GMX SMTP rate limits unknown -- test during Phase 2 development

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 02-02-PLAN.md (Email Parsing & Threading)
Resume file: .planning/phases/02-email-ingestion-pipeline/02-02-SUMMARY.md
