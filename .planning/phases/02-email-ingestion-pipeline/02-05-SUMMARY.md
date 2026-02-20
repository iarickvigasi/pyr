---
phase: 02-email-ingestion-pipeline
plan: 05
subsystem: email
tags: [email-pipeline, imap, smtp, bullmq, email-threading, contact-matching, email-classification, nodemailer, imapflow]

# Dependency graph
requires:
  - phase: 02-email-ingestion-pipeline
    plan: 01
    provides: IMAP service (createImapService), Prisma schema with email fields, mailparser/sanitize-html dependencies
  - phase: 02-email-ingestion-pipeline
    plan: 02
    provides: Email parser (parseEmail), threading engine (findConversationByHeaders, isForwardedEmail, buildReferencesChain)
  - phase: 02-email-ingestion-pipeline
    plan: 03
    provides: Email classifier (classifyEmail), contact matcher (matchOrCreateGuest)
  - phase: 02-email-ingestion-pipeline
    plan: 04
    provides: SMTP service (createSmtpService) with threading headers
provides:
  - "createEmailModule: complete EmailModuleContract implementation with pollInbox, startPolling, stopPolling, sendEmail, healthCheck"
  - "createEmailPollProcessor: BullMQ job processor that calls emailModule.pollInbox()"
  - "POST /conversations/:id/reply: SMTP outbound reply route with threading headers"
  - "PATCH /conversations/:id: accepts classification field for manual reclassification"
  - "updateConversation: general-purpose conversation update service (status + classification)"
  - "replySchema: Zod validation schema for reply body (content + optional html)"
affects: [02-06]

# Tech tracking
tech-stack:
  added: []
  patterns: [pipeline orchestration via factory function, dynamic imports to avoid test module pollution in single-fork vitest, lazy email module initialization in job processor]

key-files:
  modified:
    - packages/backend/src/services/email/index.ts
    - packages/backend/src/services/queue/jobs/email-poll.job.ts
    - packages/backend/src/services/queue/worker.ts
    - packages/backend/src/modules/inbox/inbox.routes.ts
    - packages/backend/src/modules/inbox/inbox.schema.ts
    - packages/backend/src/modules/inbox/conversation.service.ts

key-decisions:
  - "Dynamic imports in email-poll.job.ts and inbox.routes.ts to avoid polluting module cache in single-fork vitest test environments"
  - "Email module created lazily per job processor lifecycle (not per-poll) for efficiency"
  - "updateConversation generalizes updateConversationStatus -- both status and classification updated atomically with audit log"
  - "Reply route uses dynamic import for email module + threader to isolate test environments"
  - "Email signature loaded from settings table with fallback default per outbound email"

patterns-established:
  - "Pipeline orchestration: createEmailModule returns contract methods that compose IMAP, parser, threader, classifier, matcher, SMTP"
  - "Dynamic import for test isolation: use await import() inside handlers/processors for modules with heavy transitive dependencies"
  - "Lazy initialization in job processors: create module instance on first invocation, reuse across subsequent calls"

requirements-completed: [EMAIL-02]

# Metrics
duration: 12min
completed: 2026-02-20
---

# Phase 02 Plan 05: Pipeline Integration & Inbox Routes Summary

**Complete email pipeline orchestrator wiring IMAP fetch through parse/dedupe/classify/match/thread/store, BullMQ scheduler triggering every 2 minutes, and SMTP outbound reply route with threading headers**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-20T09:10:04Z
- **Completed:** 2026-02-20T09:22:53Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- EmailModuleContract fully implemented: pollInbox orchestrates the complete IMAP-to-database pipeline (fetch, parse, dedupe, classify, match guest, thread conversation, store message, audit log)
- Email poll BullMQ job processor calls emailModule.pollInbox() on a configurable schedule (default 2 minutes, minimum 30 seconds)
- POST /conversations/:id/reply sends outbound emails via SMTP with correct In-Reply-To and References threading headers
- PATCH /conversations/:id now accepts a classification field for manual reclassification (alongside existing status field)
- Pipeline is fault-tolerant: individual email failures don't block the batch, last processed UID persisted for incremental polling
- All 220 existing tests remain green, TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement EmailModuleContract with full pipeline orchestration** - `7d72332` (feat)
2. **Task 2: Wire email poll job processor, SMTP reply route, and manual reclassification** - `4b8b986` (feat)

## Files Created/Modified
- `packages/backend/src/services/email/index.ts` - Complete EmailModuleContract: pollInbox pipeline, startPolling/stopPolling scheduler management, sendEmail via SMTP, healthCheck for IMAP+SMTP
- `packages/backend/src/services/queue/jobs/email-poll.job.ts` - Real email poll processor calling emailModule.pollInbox() with lazy initialization via dynamic import
- `packages/backend/src/services/queue/worker.ts` - Email poll scheduler registered in setupSchedulers() with configurable interval from settings table
- `packages/backend/src/modules/inbox/inbox.routes.ts` - SMTP reply route (POST /:id/reply), updated PATCH /:id to handle classification via updateConversation
- `packages/backend/src/modules/inbox/inbox.schema.ts` - updateConversationSchema extended with optional classification enum, added replySchema for reply body
- `packages/backend/src/modules/inbox/conversation.service.ts` - Added updateConversation() for atomic status+classification updates, refactored updateConversationStatus to delegate

## Decisions Made
- **Dynamic imports for test isolation:** The email-poll.job.ts and inbox reply route use `await import()` instead of top-level imports for the email module and threader. This prevents transitive loading of IMAP/SMTP/audit modules in vitest's single-fork test environment, which was polluting the module cache and breaking vi.mock() in the contact-matcher unit tests.
- **Lazy email module in job processor:** The email module instance is created on the first job invocation and reused for subsequent polls, rather than creating a new instance per poll. This avoids redundant SMTP transporter creation while keeping the module lifecycle tied to the worker.
- **General updateConversation service:** Instead of adding a separate `updateConversationClassification` function, the existing `updateConversationStatus` was preserved as a thin wrapper over the new general-purpose `updateConversation` that handles both status and classification atomically with audit logging.
- **Email signature from settings:** Outbound emails load the signature from the `email_signature` setting with a sensible default fallback, making it configurable via the admin settings UI.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed FastifyBaseLogger type incompatibility with pino Logger**
- **Found during:** Task 1 (EmailModuleContract implementation)
- **Issue:** `app.log` (FastifyBaseLogger) is not directly assignable to pino's `Logger` type -- missing `msgPrefix` property in type declarations
- **Fix:** Cast `app.log as unknown as Logger` since Fastify's logger IS pino at runtime, the type declarations just diverge slightly
- **Files modified:** `packages/backend/src/services/email/index.ts`
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** `7d72332` (Task 1 commit)

**2. [Rule 3 - Blocking] Fixed Buffer type incompatibility for Prisma Bytes field**
- **Found during:** Task 1 (EmailModuleContract implementation)
- **Issue:** `raw.source` (Buffer) was not assignable to Prisma's `Bytes` field due to ArrayBufferLike vs ArrayBuffer type mismatch
- **Fix:** Wrap with `Buffer.from(raw.source)` to ensure correct Buffer type
- **Files modified:** `packages/backend/src/services/email/index.ts`
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** `7d72332` (Task 1 commit)

**3. [Rule 1 - Bug] Fixed vitest module cache pollution from top-level email module import**
- **Found during:** Task 2 (email-poll.job.ts and inbox.routes.ts changes)
- **Issue:** Top-level `import { createEmailModule }` in email-poll.job.ts caused transitive loading of email/index.ts (which imports writeAuditLog from lib/audit.js) during integration test app bootstrap. In vitest's singleFork mode, this polluted the module cache, causing vi.mock() for audit.js in the contact-matcher unit tests to not take effect. The same issue occurred with email-threader.js imports in inbox.routes.ts.
- **Fix:** Changed both email-poll.job.ts and inbox.routes.ts to use `await import()` (dynamic import) inside their handler/processor functions instead of top-level static imports. This defers module loading to runtime call time, avoiding test-time module cache pollution.
- **Files modified:** `packages/backend/src/services/queue/jobs/email-poll.job.ts`, `packages/backend/src/modules/inbox/inbox.routes.ts`
- **Verification:** All 220 tests pass including the previously-failing contact-matcher audit log test
- **Committed in:** `4b8b986` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking type issues, 1 bug)
**Impact on plan:** All fixes necessary for TypeScript compilation and test stability. No scope creep.

## Issues Encountered
- Vitest singleFork module cache pollution required dynamic imports as workaround (documented above as deviation #3)

## User Setup Required
None - no external service configuration required. IMAP/SMTP credentials are configured via environment variables at runtime.

## Next Phase Readiness
- Complete email pipeline wired and ready for end-to-end testing (02-06)
- BullMQ email poll scheduler running on configurable interval
- SMTP reply route ready for inbox UI integration
- Manual reclassification available via PATCH endpoint
- All 220 backend tests green, TypeScript compiles clean

## Self-Check: PASSED

All 6 key files verified present. Both commit hashes (7d72332, 4b8b986) found in git log.

---
*Phase: 02-email-ingestion-pipeline*
*Plan: 05*
*Completed: 2026-02-20*
