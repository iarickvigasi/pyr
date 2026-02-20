---
phase: 02-email-ingestion-pipeline
plan: 03
subsystem: email
tags: [contact-matching, email-classification, language-detection, franc-min, tdd, vitest]

# Dependency graph
requires:
  - phase: 02-email-ingestion-pipeline
    plan: 01
    provides: Prisma schema with guest model (email, language, source, deletedAt), email service directory structure
  - phase: 02-email-ingestion-pipeline
    plan: 02
    provides: ParsedEmail type with from.name/address fields, email text extraction
provides:
  - "classifyEmail: rules-based email categorization (OTA, spam, system, guest_inquiry) with confidence scores"
  - "classifyWithAi: AI classifier stub returning guest_inquiry at 0.5 confidence (Phase 4 hook)"
  - "isSystemSender: boolean check for non-guest sender addresses (OTA, spam, system)"
  - "matchOrCreateGuest: CRM guest lookup by email, auto-creation with language detection and audit log"
  - "detectLanguage: EN/DE language detection via franc-min trigram analysis"
  - "EmailCategory, ClassificationResult, AiClassifier types for downstream consumers"
affects: [02-04, 02-05, 02-06]

# Tech tracking
tech-stack:
  added: []
  patterns: [rules-based classification with priority ordering and confidence scores, mock PrismaClient with Proxy for transaction testing, vi.mock path resolution relative to test file location]

key-files:
  created:
    - packages/backend/src/services/email/email-classifier.ts
    - packages/backend/src/services/email/language-detector.ts
    - packages/backend/src/services/email/contact-matcher.ts
    - packages/backend/src/services/email/__tests__/email-classifier.test.ts
    - packages/backend/src/services/email/__tests__/contact-matcher.test.ts

key-decisions:
  - "Classification priority: OTA domains (0.95) > system senders (0.9) > system subjects (0.85) > spam senders (0.8) > spam subjects (0.75) > default guest_inquiry (0.6)"
  - "isSystemSender combines OTA + spam + system patterns for contact-matcher to skip guest creation"
  - "vi.mock paths must be relative to test file, not to module under test — ../../../lib/audit.js from __tests__/"

patterns-established:
  - "Rules-based classifier: constant pattern arrays checked in priority order, returning confidence+reason with each result"
  - "Contact matcher pattern: classify first, then match/create — non-guest classifications short-circuit before any DB access"
  - "Proxy-based PrismaClient mock: use JS Proxy to intercept model property access for both direct calls and transaction clients"

requirements-completed: [EMAIL-05, EMAIL-06]

# Metrics
duration: 4min
completed: 2026-02-20
---

# Phase 02 Plan 03: Contact Matching & Email Classification Summary

**Rules-based email classifier with OTA/spam/system pattern detection, franc-min EN/DE language detector, and CRM contact matcher with auto-guest-creation and audit logging**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-20T08:58:56Z
- **Completed:** 2026-02-20T09:03:13Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Email classifier categorizes emails into 4 categories (guest_inquiry, ota_notification, spam_newsletter, admin_system) using prioritized rules with confidence scores
- Contact matcher looks up existing CRM guests by exact email (excluding soft-deleted), auto-creates new guests for unknown guest inquiry senders with detected language and audit trail
- Language detector uses franc-min trigram analysis restricted to English/German, with safe fallback to English for short/empty text
- AI classifier stub provides clean Phase 4 hook point returning guest_inquiry at 0.5 confidence
- 36 new unit tests (25 classifier + 11 contact matcher) all passing, 220 total backend tests green

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1: TDD email classification** - `a10d9bb` (test: RED), `50044e7` (feat: GREEN)
2. **Task 2: TDD contact matcher** - `b052669` (test: RED), `89772e0` (feat: GREEN)

## Files Created/Modified
- `packages/backend/src/services/email/email-classifier.ts` - Rules-based classifier with OTA domains, spam patterns, system patterns, AI stub, isSystemSender helper
- `packages/backend/src/services/email/language-detector.ts` - EN/DE language detection via franc-min with short-text fallback
- `packages/backend/src/services/email/contact-matcher.ts` - CRM guest lookup and auto-creation with language detection and audit logging
- `packages/backend/src/services/email/__tests__/email-classifier.test.ts` - 25 tests: classifyEmail (15), detectLanguage (5), classifyWithAi (1), isSystemSender (4)
- `packages/backend/src/services/email/__tests__/contact-matcher.test.ts` - 11 tests: guest match, auto-create, language, source, classification skips, name fallback, audit log

## Decisions Made
- **Classification priority order:** OTA domains checked first (highest confidence 0.95) since they are exact domain matches. System patterns next (0.9/0.85). Spam last among rules (0.8/0.75) as more likely to have false positives. Default guest_inquiry at 0.6 confidence.
- **isSystemSender combines all non-guest patterns:** Single function for contact-matcher to call, combining OTA + spam + system checks. This avoids the contact matcher needing to know about individual pattern types.
- **Mock path correction:** `vi.mock` resolves relative paths from the test file location, not from the module under test. The audit.js mock needed `../../../lib/audit.js` (from `__tests__/`) not `../../lib/audit.js` (from `services/email/`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed vi.mock path resolution for audit.js**
- **Found during:** Task 2 (Contact matcher GREEN phase)
- **Issue:** `vi.mock('../../lib/audit.js')` resolved relative to the test file at `__tests__/`, pointing to `src/services/lib/audit.js` instead of `src/lib/audit.js`
- **Fix:** Changed to `vi.mock('../../../lib/audit.js')` to correctly resolve from the test file directory
- **Files modified:** `packages/backend/src/services/email/__tests__/contact-matcher.test.ts`
- **Verification:** All 11 contact matcher tests pass including audit log assertion
- **Committed in:** `89772e0` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor path fix required for correct mock resolution. No scope creep.

## Issues Encountered
None beyond the mock path issue documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Email classifier ready for pipeline orchestrator to route emails to correct categories (02-04)
- Contact matcher ready for linking incoming emails to CRM guest profiles (02-04)
- isSystemSender available for skipping guest creation on non-guest emails (02-04)
- detectLanguage available for any future module needing EN/DE detection
- classifyWithAi stub ready for Phase 4 AI engine replacement
- All 220 backend tests green, TypeScript compiles clean

## Self-Check: PASSED

All 5 key files verified present. All 4 commit hashes (a10d9bb, 50044e7, b052669, 89772e0) found in git log.

---
*Phase: 02-email-ingestion-pipeline*
*Plan: 03*
*Completed: 2026-02-20*
