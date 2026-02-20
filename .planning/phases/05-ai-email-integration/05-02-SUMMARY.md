---
phase: 05-ai-email-integration
plan: 02
subsystem: api
tags: [prisma, faq, ai, system-prompt, context-builder, zod, fastify]

# Dependency graph
requires:
  - phase: 04-ai-communication-engine
    provides: AI draft generation pipeline, context builder, system prompt templates
provides:
  - Faq Prisma model and migration for FAQ storage
  - 5 FAQ CRUD REST endpoints under /api/v1/faqs
  - FAQ injection into AI system prompt via context builder
  - formatFaqs helper for system prompt formatting
affects: [05-ai-email-integration, frontend-faq-management]

# Tech tracking
tech-stack:
  added: []
  patterns: [faq-crud-with-audit, context-enrichment-pattern]

key-files:
  created:
    - packages/backend/prisma/migrations/20260220174100_add_faq_model/migration.sql
    - packages/backend/src/modules/settings/faq.schema.ts
    - packages/backend/src/modules/settings/faq.service.ts
    - packages/backend/src/modules/settings/faq.routes.ts
  modified:
    - packages/backend/prisma/schema.prisma
    - packages/backend/src/app.ts
    - packages/backend/src/services/ai/context-builder.ts
    - packages/backend/src/services/ai/prompts/system.ts
    - packages/backend/src/services/ai/__tests__/context-builder.test.ts
    - packages/backend/src/services/ai/__tests__/draft-generator.test.ts

key-decisions:
  - "Hard delete for FAQ entries -- ephemeral content, not core business data"
  - "Response schema uses z.date() for Prisma Date fields -- Fastify serializer handles Date-to-string"
  - "All FAQs injected into every prompt -- LLM naturally selects relevant ones based on conversation context"

patterns-established:
  - "FAQ CRUD pattern: schema.ts + service.ts + routes.ts with audit logging on all mutations"
  - "Context enrichment: new data sources added to DraftContext interface and buildDraftContext loader"

requirements-completed: [AI-04]

# Metrics
duration: 5min
completed: 2026-02-20
---

# Phase 05 Plan 02: FAQ Knowledge Base Summary

**FAQ Prisma model with CRUD API, audit logging, and injection into AI system prompt for context-aware draft generation**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-20T17:40:41Z
- **Completed:** 2026-02-20T17:46:28Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Faq Prisma model with question, answer, tags fields and migration
- 5 CRUD REST endpoints (list, get, create, update, delete) with audit logging on all mutations
- FAQ entries loaded in context builder and formatted into AI system prompt
- formatFaqs helper with empty-array graceful fallback
- Tests updated: 7 new test cases for formatFaqs, FAQ in system prompt, and FAQ loading in context builder

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Faq Prisma model and CRUD backend** - `13ab9cb` (feat)
2. **Task 2: Inject FAQ entries into AI context builder and system prompt** - `35d88ae` (feat)

## Files Created/Modified
- `packages/backend/prisma/schema.prisma` - Added Faq model
- `packages/backend/prisma/migrations/20260220174100_add_faq_model/migration.sql` - Migration SQL for faqs table
- `packages/backend/src/modules/settings/faq.schema.ts` - Zod schemas for FAQ CRUD (create, update, list query, response)
- `packages/backend/src/modules/settings/faq.service.ts` - FAQ service with CRUD operations and audit logging
- `packages/backend/src/modules/settings/faq.routes.ts` - Fastify routes for 5 FAQ endpoints
- `packages/backend/src/app.ts` - Registered FAQ routes at /api/v1/faqs
- `packages/backend/src/services/ai/context-builder.ts` - Added faqs to DraftContext type and loader
- `packages/backend/src/services/ai/prompts/system.ts` - Added formatFaqs helper and FAQ section in prompt
- `packages/backend/src/services/ai/__tests__/context-builder.test.ts` - Added FAQ test cases and mock data
- `packages/backend/src/services/ai/__tests__/draft-generator.test.ts` - Added faq mock to Prisma mock

## Decisions Made
- **Hard delete for FAQs**: FAQ entries are ephemeral content management, not core business data. Hard delete is appropriate per CLAUDE.md guidelines.
- **z.date() in response schemas**: Prisma returns Date objects; using z.date() lets Fastify's serializer handle Date-to-ISO-string conversion at the type level.
- **All FAQs injected into every prompt**: With expected 10-50 FAQ entries, all fit within token limits. The LLM naturally selects relevant FAQs based on conversation context, eliminating the need for embedding-based retrieval.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed response schema type mismatch (z.string vs z.date)**
- **Found during:** Task 1 (FAQ route creation)
- **Issue:** Response schema used z.string() for createdAt/updatedAt but Prisma returns Date objects, causing TypeScript errors
- **Fix:** Changed to z.date() in response schemas, which Fastify serializes to ISO strings at runtime
- **Files modified:** packages/backend/src/modules/settings/faq.schema.ts
- **Verification:** npx tsc --noEmit passes clean
- **Committed in:** 13ab9cb (Task 1 commit)

**2. [Rule 1 - Bug] Fixed draft-generator test mock missing faq model**
- **Found during:** Task 2 (context builder modification)
- **Issue:** Existing draft-generator tests used a mock Prisma without faq model, causing "Cannot read properties of undefined" errors
- **Fix:** Added faq mock with findMany returning empty array to makePrisma factory
- **Files modified:** packages/backend/src/services/ai/__tests__/draft-generator.test.ts
- **Verification:** pnpm test passes (352/354 -- 2 pre-existing failures unrelated to this plan)
- **Committed in:** 35d88ae (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
- Manual Prisma migration required (no DATABASE_URL in CI/dev environment) -- created SQL migration manually, consistent with prior phase approach
- 2 pre-existing test failures in inbox.test.ts (missing input_tokens column in test DB) -- out of scope, not caused by this plan

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- FAQ CRUD API ready for frontend management UI
- AI draft generation now includes FAQ context for more accurate responses
- Ready for Plan 03 (Email Template & Signature Management) and Plan 04 (Frontend AI Draft UI)

---
*Phase: 05-ai-email-integration*
*Completed: 2026-02-20*
