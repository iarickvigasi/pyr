---
phase: 02-email-ingestion-pipeline
plan: 04
subsystem: email
tags: [smtp, nodemailer, email-threading, outbound-email, html-email, signature]

# Dependency graph
requires:
  - phase: 02-email-ingestion-pipeline
    plan: 01
    provides: Email service directory structure, nodemailer dependency
provides:
  - "createSmtpService: SMTP sending service with threading headers, signature append, and connection verification"
  - "SmtpConfig: SMTP connection configuration interface (host, port, user, pass, secure)"
  - "SendReplyParams: Reply email parameters with inReplyTo and references for threading"
affects: [02-05, 02-06]

# Tech tracking
tech-stack:
  added: []
  patterns: [factory function creating nodemailer transporter once with connection pooling, References header capped at 20 Message-IDs]

key-files:
  modified:
    - packages/backend/src/services/email/smtp.service.ts

key-decisions:
  - "No retry logic in SMTP service — caller or BullMQ handles retries"
  - "Transporter created once in factory (not per-send) — nodemailer handles connection pooling internally"
  - "Logger type is pino Logger (consistent with imap.service.ts) rather than FastifyBaseLogger"

patterns-established:
  - "SMTP service pattern: factory creates transporter once, returns sendReply/sendNew/verifyConnection methods"
  - "Threading header pattern: inReplyTo as string, references as space-separated string, capped at 20 entries"

requirements-completed: [EMAIL-07]

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 02 Plan 04: SMTP Sending Service Summary

**Nodemailer SMTP service with In-Reply-To/References threading headers, configurable signature, and Re: subject auto-prefix**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-20T09:05:44Z
- **Completed:** 2026-02-20T09:07:23Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- SMTP sending service sends HTML emails via configurable SMTP provider with correct From and Reply-To headers
- Threading headers (In-Reply-To, References) preserved on reply emails for Gmail, Outlook, and Apple Mail compatibility
- References header capped at 20 most recent Message-IDs to prevent unbounded growth
- Auto-prefixes subject with "Re: " for replies (case-insensitive duplicate check)
- Configurable email signature appended to all outbound email body content
- Generated Message-ID returned for storage and future threading chain
- Connection verification via transporter.verify() for health checks
- All 220 existing backend tests remain green, TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement SMTP sending service with threading headers and signature** - `06b82ac` (feat)

## Files Created/Modified
- `packages/backend/src/services/email/smtp.service.ts` - SMTP sending service with sendReply (threading headers), sendNew (no threading), verifyConnection, configurable signature append

## Decisions Made
- **No retry in SMTP service:** The service is a simple send-and-report layer. Retry logic belongs in the caller (inbox route or BullMQ job queue), keeping the service focused and testable.
- **Transporter created once:** Nodemailer handles connection pooling internally, so we create the transporter in the factory function rather than per-send call.
- **Logger type consistency:** Used `Logger` from pino (matching imap.service.ts pattern) rather than `FastifyBaseLogger` from the plan, since Fastify's logger IS a pino Logger and this keeps the email services consistent.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. SMTP credentials are configured via environment variables at runtime.

## Next Phase Readiness
- SMTP service ready for inbox reply routes to send outbound emails (02-05)
- sendReply returns Message-ID for storing in conversations/messages for future threading chains
- verifyConnection available for health check integration
- All 220 backend tests green, TypeScript compiles clean

## Self-Check: PASSED

All key files verified present. Commit hash 06b82ac found in git log.

---
*Phase: 02-email-ingestion-pipeline*
*Plan: 04*
*Completed: 2026-02-20*
