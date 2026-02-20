---
phase: 05-ai-email-integration
plan: 03
subsystem: ui
tags: [react, shadcn, dialog, draft-review, faq-management, react-query, next.js]

# Dependency graph
requires:
  - phase: 05-ai-email-integration
    provides: AI draft pipeline with approve/reject/regenerate endpoints, FAQ CRUD API
  - phase: 03-email-ui-ota-parsing
    provides: Inbox page with conversation thread, email message component, draft card
  - phase: 04-ai-communication-engine
    provides: AI draft generation, draft status types, cost/token tracking
provides:
  - Two-step approve dialog for AI drafts (preview before send)
  - Reject + regenerate flow with inline regenerate button
  - Failed draft error card with retry button
  - Inline draft display after triggering message in conversation thread
  - FAQ management tab in Settings with full CRUD UI
affects: [05-ai-email-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [two-step-confirm-dialog, inline-draft-rendering, faq-crud-ui]

key-files:
  created:
    - packages/frontend/src/lib/hooks/use-faq.ts
    - packages/frontend/src/components/features/settings/faq-tab.tsx
  modified:
    - packages/frontend/src/components/features/inbox/draft-card.tsx
    - packages/frontend/src/components/features/inbox/conversation-thread.tsx
    - packages/frontend/src/components/features/inbox/inbox-page.tsx
    - packages/frontend/src/lib/hooks/use-conversations.ts
    - packages/frontend/src/components/features/settings/settings-page.tsx

key-decisions:
  - "Two-step approve uses shadcn Dialog with preview content and explicit Send Email confirmation"
  - "Rejected drafts show grayed-out with strikethrough and Generate new draft button"
  - "Failed drafts detected via 5-second polling (same as pending drafts) -- no separate error mechanism"
  - "Manual reply composer always visible regardless of draft state"
  - "FAQ tag filtering uses client-side Set dedup from loaded FAQ data"

patterns-established:
  - "Two-step confirm pattern: action button opens preview Dialog, confirm button executes"
  - "Inline draft rendering: drafts mapped by messageId and rendered after their triggering message"
  - "FAQ CRUD UI pattern: card list with Dialog form and AlertDialog delete confirmation"

requirements-completed: [EMAIL-10, AI-04]

# Metrics
duration: 4min
completed: 2026-02-20
---

# Phase 05 Plan 03: Draft Review UI & FAQ Management Summary

**Two-step approve dialog with preview, reject+regenerate flow, inline draft display, and FAQ management tab with CRUD in Settings**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-20T17:49:15Z
- **Completed:** 2026-02-20T17:53:26Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- DraftCard reworked with two-step approve flow: Approve button opens preview Dialog, Send Email button confirms
- Reject + regenerate flow: rejected drafts shown grayed-out with strikethrough, "Generate new draft" button triggers regeneration
- Failed drafts shown as error cards with destructive styling and Retry button
- Drafts render inline in conversation thread after their triggering message (not in a separate section)
- Manual reply composer always available regardless of draft state
- FAQ management tab in Settings with card list, create/edit Dialog form, delete AlertDialog confirmation, and tag filtering

## Task Commits

Each task was committed atomically:

1. **Task 1: Enhanced DraftCard with two-step approve, reject+regenerate, inline drafts** - `397abdf` (feat)
2. **Task 2: FAQ management tab in Settings page** - `194a804` (feat)

## Files Created/Modified
- `packages/frontend/src/components/features/inbox/draft-card.tsx` - Two-step approve Dialog, reject+regenerate, failed draft error card
- `packages/frontend/src/components/features/inbox/conversation-thread.tsx` - Inline draft rendering after triggering message
- `packages/frontend/src/components/features/inbox/inbox-page.tsx` - Wired reject/regenerate hooks, composer always visible
- `packages/frontend/src/lib/hooks/use-conversations.ts` - useRejectDraft, useRegenerateDraft hooks, 5s draft polling, updated approve endpoint
- `packages/frontend/src/lib/hooks/use-faq.ts` - React Query hooks for FAQ CRUD (useFaqs, useCreateFaq, useUpdateFaq, useDeleteFaq)
- `packages/frontend/src/components/features/settings/faq-tab.tsx` - FAQ management UI with Dialog forms and AlertDialog delete
- `packages/frontend/src/components/features/settings/settings-page.tsx` - Added FAQ tab between Email & AI and Business Hours

## Decisions Made
- Two-step approve uses shadcn Dialog -- Approve/Send opens a preview of the final email text, then "Send Email" confirms. This prevents accidental sends.
- Rejected drafts show grayed-out content with strikethrough and a "Generate new draft" button. The regenerate button only appears for rejected and failed drafts.
- Failed drafts (status='failed') are detected via the same 5-second polling as pending drafts. No separate error mechanism needed -- the onFailed handler writes a failed draft record that the frontend picks up.
- Manual reply composer is always visible at the bottom, even when a pending draft exists. Ines might want to write a manual reply regardless.
- FAQ tag filtering uses client-side dedup from loaded FAQ data, with badge-based toggle UI. No server-side tag endpoint needed for MVP scale.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Draft review UI complete with all lifecycle states (pending, approved, edited, rejected, failed)
- FAQ management UI connects to existing backend CRUD API from Plan 02
- Ready for Plan 04 (Final integration testing / polish)

## Self-Check: PASSED

All 7 files verified present. Both task commits (397abdf, 194a804) verified in git log.

---
*Phase: 05-ai-email-integration*
*Completed: 2026-02-20*
