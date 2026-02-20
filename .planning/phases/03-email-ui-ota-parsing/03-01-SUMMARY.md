---
phase: 03-email-ui-ota-parsing
plan: 01
subsystem: ui, api, database
tags: [inbox, email, gmail-style, iframe, dompurify, attachments, unread, classification, prisma]

# Dependency graph
requires:
  - phase: 02-email-ingestion-pipeline
    provides: IMAP polling, email parsing, conversation/message storage, SMTP reply
provides:
  - Gmail-style stacked email inbox UI with HTML rendering
  - Attachment model and binary serving endpoint
  - Unread conversation tracking with sidebar badge
  - Classification badges and manual reclassification dropdown
  - 30-second auto-refresh on conversations and unread count
  - Attachment extraction and storage during email polling
affects: [03-email-ui-ota-parsing, ai-communication-engine]

# Tech tracking
tech-stack:
  added: [dompurify]
  patterns: [sandboxed-iframe-html-rendering, auto-refresh-polling, mark-read-on-view]

key-files:
  created:
    - packages/backend/prisma/migrations/20260220110700_add_attachments_unread_ota_booking_fields/migration.sql
    - packages/frontend/src/components/features/inbox/email-html-renderer.tsx
    - packages/frontend/src/components/features/inbox/email-message.tsx
    - packages/frontend/src/components/features/inbox/attachment-list.tsx
    - packages/frontend/src/components/features/inbox/classification-badge.tsx
    - packages/frontend/src/components/features/inbox/reclassify-dropdown.tsx
  modified:
    - packages/backend/prisma/schema.prisma
    - packages/backend/src/modules/inbox/inbox.routes.ts
    - packages/backend/src/modules/inbox/inbox.schema.ts
    - packages/backend/src/modules/inbox/conversation.service.ts
    - packages/backend/src/services/email/email-parser.ts
    - packages/backend/src/services/email/index.ts
    - packages/backend/src/types/entities.ts
    - packages/frontend/src/components/features/inbox/inbox-page.tsx
    - packages/frontend/src/components/features/inbox/conversation-list.tsx
    - packages/frontend/src/components/features/inbox/conversation-thread.tsx
    - packages/frontend/src/components/features/inbox/index.ts
    - packages/frontend/src/components/layout/sidebar.tsx
    - packages/frontend/src/lib/hooks/use-conversations.ts
    - packages/frontend/src/lib/query-client.ts

key-decisions:
  - "Sandboxed iframe with DOMPurify for HTML email rendering -- CSP blocks scripts, sandbox allows popups for links"
  - "Mark conversation as read atomically on getConversation via Prisma transaction"
  - "Attachment data stored as Bytes in PostgreSQL -- avoids external file storage complexity for MVP"
  - "30-second refetchInterval on both conversations list and unread count -- balances freshness vs load"
  - "isRead defaults to true on Conversation -- existing conversations don't retroactively show as unread"

patterns-established:
  - "Sandboxed iframe HTML rendering: DOMPurify sanitize + iframe srcDoc with CSP + ResizeObserver for auto-height"
  - "Mark-read-on-view: update isRead in same transaction as fetch to avoid race conditions"
  - "Auto-refresh polling: refetchInterval on React Query hooks for near-real-time inbox updates"

requirements-completed: [EMAIL-08]

# Metrics
duration: 11min
completed: 2026-02-20
---

# Phase 03 Plan 01: Inbox UI Rewrite Summary

**Gmail-style stacked email inbox with sandboxed HTML rendering, attachment support, unread tracking, classification badges, and 30-second auto-refresh**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-20T11:06:17Z
- **Completed:** 2026-02-20T11:17:22Z
- **Tasks:** 3
- **Files modified:** 22

## Accomplishments
- Replaced chat-bubble inbox with Gmail-style stacked email blocks showing sender, timestamp, direction, and expandable details
- Added sandboxed iframe HTML email rendering with DOMPurify sanitization and auto-resize
- Built attachment model, binary serving endpoint, and inline image preview / download UI
- Implemented unread conversation tracking with sidebar badge and mark-read-on-view
- Added classification badges and manual reclassification dropdown on each conversation
- 30-second auto-refresh on conversations list and unread count

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration + backend inbox extensions** - `7761236` (feat)
2. **Task 2a: New inbox component primitives** - `768b104` (feat)
3. **Task 2b: Rewrite existing inbox pages and wire all components** - `5a58430` (feat)

## Files Created/Modified

### Created
- `packages/backend/prisma/migrations/20260220110700_.../migration.sql` - Attachment table, isRead, OTA booking fields
- `packages/frontend/src/components/features/inbox/email-html-renderer.tsx` - Sandboxed iframe HTML rendering with DOMPurify
- `packages/frontend/src/components/features/inbox/email-message.tsx` - Gmail-style stacked email block with expandable details
- `packages/frontend/src/components/features/inbox/attachment-list.tsx` - Grid with image previews and download links
- `packages/frontend/src/components/features/inbox/classification-badge.tsx` - Color-coded classification tag component
- `packages/frontend/src/components/features/inbox/reclassify-dropdown.tsx` - Inline reclassification dropdown with PATCH mutation

### Modified
- `packages/backend/prisma/schema.prisma` - Attachment model, Conversation.isRead, Booking.sourceConversationId + needsReview
- `packages/backend/src/modules/inbox/inbox.routes.ts` - GET /unread-count, GET attachment binary endpoints
- `packages/backend/src/modules/inbox/inbox.schema.ts` - unreadCountResponseSchema, attachmentParamsSchema
- `packages/backend/src/modules/inbox/conversation.service.ts` - Mark-read on view, getUnreadCount, messagePreview, include attachments
- `packages/backend/src/services/email/email-parser.ts` - Extract attachments from parsed emails
- `packages/backend/src/services/email/index.ts` - Store attachments + set isRead=false on new inbound emails
- `packages/backend/src/types/entities.ts` - Attachment type, isRead on Conversation, OTA fields on Booking
- `packages/frontend/src/components/features/inbox/inbox-page.tsx` - Full-height two-pane layout with reclassification
- `packages/frontend/src/components/features/inbox/conversation-list.tsx` - Rich preview rows with unread indicators
- `packages/frontend/src/components/features/inbox/conversation-thread.tsx` - Stacked EmailMessage blocks
- `packages/frontend/src/components/features/inbox/index.ts` - Export all new components
- `packages/frontend/src/components/layout/sidebar.tsx` - Unread count badge on Inbox nav item
- `packages/frontend/src/lib/hooks/use-conversations.ts` - Extended types, useUnreadCount, useUpdateConversation, refetchInterval
- `packages/frontend/src/lib/query-client.ts` - unreadCount query key

## Decisions Made
- Used sandboxed iframe with DOMPurify for HTML email rendering instead of inline dangerouslySetInnerHTML -- prevents CSS leaking into dashboard and blocks scripts via CSP
- Store attachment data as Bytes in PostgreSQL -- avoids external file storage complexity for MVP volume
- Default isRead=true on Conversation model so existing conversations don't retroactively appear unread
- 30-second refetchInterval balances inbox freshness against server load for single-user MVP
- Mark conversation as read in atomic transaction with fetch to prevent race conditions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Buffer type compatibility with Prisma Bytes field**
- **Found during:** Task 1 (email service attachment storage)
- **Issue:** TypeScript strict mode rejected `Buffer` as assignment to Prisma `Bytes` field due to `ArrayBufferLike` vs `ArrayBuffer` incompatibility
- **Fix:** Used `Buffer.from(att.content.buffer, att.content.byteOffset, att.content.byteLength) as Buffer<ArrayBuffer>` cast
- **Files modified:** `packages/backend/src/services/email/index.ts`
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** 7761236 (Task 1 commit)

**2. [Rule 3 - Blocking] Migration needed reset due to modified earlier migration checksum**
- **Found during:** Task 1 (schema migration)
- **Issue:** A previously applied migration had been modified, preventing `prisma migrate dev`
- **Fix:** Created migration SQL manually and applied via `prisma migrate deploy` to both dev and test databases
- **Files modified:** Migration SQL file created manually
- **Verification:** Both databases migrated successfully, all 254 tests pass
- **Committed in:** 7761236 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for task completion. No scope creep.

## Issues Encountered
- `@types/dompurify` is deprecated (dompurify v3 ships its own types) -- harmless warning during install, no action needed

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Inbox UI is fully functional with real email data
- Ready for OTA email parsing (plan 03-02) to leverage classification badges and attachment support
- HTML renderer will display OTA notification emails correctly

## Self-Check: PASSED

All 7 key files verified present. All 3 task commits (7761236, 768b104, 5a58430) verified in git log.

---
*Phase: 03-email-ui-ota-parsing*
*Completed: 2026-02-20*
