---
phase: 02-email-ingestion-pipeline
plan: 02
subsystem: email
tags: [mailparser, sanitize-html, mime-parsing, email-threading, tdd, vitest]

# Dependency graph
requires:
  - phase: 02-email-ingestion-pipeline
    plan: 01
    provides: Prisma schema with email fields (rawSource, htmlContent, messageId, inReplyTo, references), mailparser and sanitize-html dependencies
provides:
  - "parseEmail: MIME source to structured ParsedEmail with sanitized HTML"
  - "sanitizeEmailHtml: strict HTML allowlist sanitizer for email content"
  - "findConversationByHeaders: In-Reply-To/References header matching against existing messages"
  - "buildReferencesChain: outbound References chain builder with 20-entry cap and dedup"
  - "isForwardedEmail: Fwd:/Fw: subject detection for forcing new conversations"
affects: [02-03, 02-04, 02-05, 02-06]

# Tech tracking
tech-stack:
  added: []
  patterns: [TDD red-green for pure email transformation functions, mock PrismaClient for unit testing DB-dependent logic]

key-files:
  created:
    - packages/backend/src/services/email/email-parser.ts
    - packages/backend/src/services/email/email-threader.ts
    - packages/backend/src/services/email/__tests__/email-parser.test.ts
    - packages/backend/src/services/email/__tests__/email-threader.test.ts

key-decisions:
  - "sanitize-html strict allowlist: only http/https/mailto schemes, no javascript:/data: URLs on any element"
  - "References checked newest-first (reverse order) for threading — most recent ancestor is most likely match"
  - "Forwarded emails (Fwd:/Fw:) always force new conversation creation regardless of threading headers"
  - "References chain capped at 20 entries to prevent unbounded header growth on long threads"

patterns-established:
  - "TDD for email service modules: failing test first, then minimal implementation, tests verify behavior"
  - "Mock PrismaClient with vi.fn() for unit testing DB-dependent email logic without real database"
  - "Inline MIME test fixtures: construct minimal valid MIME messages as Buffer for parser testing"

requirements-completed: [EMAIL-03, EMAIL-04]

# Metrics
duration: 4min
completed: 2026-02-20
---

# Phase 02 Plan 02: Email Parsing & Threading Summary

**MIME email parser with mailparser + sanitize-html allowlist, and conversation threading engine using In-Reply-To/References header matching with 20-entry cap**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-20T08:52:40Z
- **Completed:** 2026-02-20T08:56:16Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Email parser converts raw MIME source to structured ParsedEmail with all fields extracted (messageId, from, to, subject, text, sanitized HTML, date, threading headers)
- HTML sanitization with strict allowlist strips scripts, iframes, style blocks, event handlers, and dangerous URL schemes while preserving formatting, tables, and images
- Threading engine matches emails to conversations via In-Reply-To (primary) and References (fallback, newest-first), with null return for unthreadable emails
- Forwarded email detection and References chain builder with deduplication and 20-entry cap
- 29 new unit tests (16 parser + 13 threader) all passing, 184 total backend tests green

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1: TDD email parser** - `3500c3f` (test: RED), `909be20` (feat: GREEN)
2. **Task 2: TDD email threading engine** - `e9b8f6f` (test: RED), `6ecc907` (feat: GREEN)

## Files Created/Modified
- `packages/backend/src/services/email/email-parser.ts` - MIME parser with mailparser, HTML sanitizer with sanitize-html strict allowlist
- `packages/backend/src/services/email/email-threader.ts` - Conversation threading by headers, References chain builder, forward detection
- `packages/backend/src/services/email/__tests__/email-parser.test.ts` - 16 tests: parseEmail (9 cases) + sanitizeEmailHtml (7 cases)
- `packages/backend/src/services/email/__tests__/email-threader.test.ts` - 13 tests: findConversationByHeaders (6 cases) + buildReferencesChain (4 cases) + isForwardedEmail (3 cases)

## Decisions Made
- **Sanitize-html strict allowlist:** Only http, https, mailto schemes allowed. Blocks javascript: and data: on all elements including img src. This prevents tracking pixel abuse while still displaying legitimate images.
- **References checked newest-first:** When In-Reply-To doesn't match, References are iterated in reverse order. The most recent ancestor message is the most likely still-existing match in the database.
- **Forwarded emails force new conversation:** Subject lines starting with Fwd:/Fw: (case-insensitive) are flagged via isForwardedEmail(). The pipeline orchestrator will use this to skip threading and create a new conversation.
- **References chain capped at 20:** buildReferencesChain deduplicates and drops oldest entries when the chain exceeds 20 Message-IDs, preventing unbounded header growth in long email threads.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - plan executed cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Email parser ready for integration into email poll processor (02-03)
- Threading engine ready for conversation routing in pipeline orchestrator (02-03)
- isForwardedEmail available for forward detection in pipeline (02-03)
- All 184 backend tests green, TypeScript compiles clean

## Self-Check: PASSED

All 4 key files verified present. All 4 commit hashes (3500c3f, 909be20, e9b8f6f, 6ecc907) found in git log.

---
*Phase: 02-email-ingestion-pipeline*
*Plan: 02*
*Completed: 2026-02-20*
