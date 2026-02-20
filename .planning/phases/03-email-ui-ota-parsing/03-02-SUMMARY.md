---
phase: 03-email-ui-ota-parsing
plan: 02
subsystem: api, ui
tags: [encryption, aes-256-gcm, tiptap, imap, smtp, settings, email-provider]

# Dependency graph
requires:
  - phase: 02-email-ingestion-pipeline
    provides: "Email module (IMAP polling, SMTP sending, email-poll scheduler)"
  - phase: 03-email-ui-ota-parsing
    plan: 01
    provides: "Inbox UI, conversation model with isRead, attachment storage"
provides:
  - "AES-256-GCM credential encryption for email provider config"
  - "Connection test endpoint (POST /test-email-connection) for IMAP+SMTP validation"
  - "Email provider CRUD routes (GET/POST /email-provider, POST /toggle-polling)"
  - "Settings-based email config with env var fallback in email module"
  - "Email provider settings UI with GMX/Gmail/Outlook/Custom presets"
  - "Tiptap rich text signature editor"
affects: [04-ai-engine, 06-calendar-sync]

# Tech tracking
tech-stack:
  added: ["@tiptap/react", "@tiptap/pm", "@tiptap/starter-kit", "@tiptap/extension-link"]
  patterns: ["AES-256-GCM encryption with JWT_SECRET-derived key", "settings-table-based config with env var fallback", "dynamic import in routes to avoid test module loading"]

key-files:
  created:
    - packages/backend/src/lib/encryption.ts
    - packages/frontend/src/components/features/settings/email-provider-section.tsx
    - packages/frontend/src/components/features/settings/signature-editor.tsx
  modified:
    - packages/backend/src/modules/settings/settings.routes.ts
    - packages/backend/src/modules/settings/settings.schema.ts
    - packages/backend/src/modules/settings/settings.service.ts
    - packages/backend/src/services/email/index.ts
    - packages/frontend/src/components/features/settings/email-ai-tab.tsx
    - packages/frontend/src/lib/hooks/use-settings.ts

key-decisions:
  - "JWT_SECRET as encryption key source via scrypt derivation -- simplification for MVP, single secret to manage"
  - "Dynamic import of ImapFlow and nodemailer in test-connection route -- avoids loading email deps in settings test suite"
  - "SMTP service lazily recreated only when config changes -- avoids redundant transporter creation"
  - "Signature stored as HTML object { html: string } with backward compat for { text: string }"

patterns-established:
  - "Credential encryption: encrypt() before DB write, decrypt() on read, never return plaintext to frontend"
  - "Settings-based config fallback: try settings table first, fall back to env vars if not configured"

requirements-completed: [EMAIL-11]

# Metrics
duration: 9min
completed: 2026-02-20
---

# Phase 3 Plan 2: Email Provider Settings Summary

**AES-256-GCM encrypted email credentials with IMAP/SMTP connection testing, provider presets (GMX/Gmail/Outlook), polling control, and Tiptap rich text signature editor**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-20T11:20:49Z
- **Completed:** 2026-02-20T11:29:54Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Backend credential encryption with AES-256-GCM (iv:authTag:ciphertext format), passwords never returned to frontend
- Connection test endpoint validates both IMAP and SMTP with 10s timeouts before config can be saved
- Email module now reads config from settings table (encrypted) with seamless env var fallback
- Frontend provider presets auto-fill host/port for GMX, Gmail, and Outlook
- Tiptap rich text signature editor with bold/italic/link toolbar replaces plain textarea

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend credential encryption, connection test endpoint, and settings-based email config** - `058c610` (feat)
2. **Task 2: Frontend email provider settings section with Tiptap signature editor** - `f2476e4` (feat)

## Files Created/Modified
- `packages/backend/src/lib/encryption.ts` - AES-256-GCM encrypt/decrypt utilities using JWT_SECRET-derived key
- `packages/backend/src/modules/settings/settings.schema.ts` - Added Zod schemas for email provider config, connection test, toggle polling
- `packages/backend/src/modules/settings/settings.service.ts` - Added getEmailProviderConfig, saveEmailProviderConfig, toggleEmailPolling helpers
- `packages/backend/src/modules/settings/settings.routes.ts` - Added 4 new routes: test-email-connection, email-provider GET/POST, toggle-polling
- `packages/backend/src/services/email/index.ts` - Refactored to use resolveEmailConfig with settings table + env var fallback
- `packages/frontend/src/components/features/settings/email-provider-section.tsx` - Full email provider config form with presets, connection testing, polling control
- `packages/frontend/src/components/features/settings/signature-editor.tsx` - Tiptap rich text editor with bold/italic/link toolbar
- `packages/frontend/src/components/features/settings/email-ai-tab.tsx` - Integrated EmailProviderSection and SignatureEditor, HTML signature storage
- `packages/frontend/src/lib/hooks/use-settings.ts` - Added useEmailProviderConfig, useSaveEmailProviderConfig, useTestEmailConnection, useTogglePolling hooks

## Decisions Made
- **JWT_SECRET as encryption key source:** Using scrypt derivation from JWT_SECRET avoids a second secret for MVP. Documented as simplification.
- **Dynamic imports for IMAP/SMTP in test-connection route:** Prevents loading heavy email modules when only running settings tests.
- **Lazy SMTP service recreation:** Only recreates the nodemailer transporter when config actually changes, not on every call.
- **HTML signature with backward compat:** Stores as `{ html: string }`, reads with `val.html ?? val.text` fallback for existing plain-text signatures.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict mode errors in encryption.ts**
- **Found during:** Task 1 (encryption utility)
- **Issue:** `String.split(':')` returns `(string | undefined)[]` in strict mode, causing Buffer.from type errors
- **Fix:** Added explicit null guards and typed intermediate variables
- **Files modified:** packages/backend/src/lib/encryption.ts
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** 058c610 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Minimal -- strict TypeScript compliance fix, no scope change.

## Issues Encountered
None -- plan executed as written with only a minor strict mode type fix.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Email provider configuration is fully functional from the admin UI
- Connection testing validates credentials before save
- Encrypted credentials ready for production use
- Next plan (03-03) can build on the configurable email infrastructure

## Self-Check: PASSED

All 4 created files verified on disk. Both commit hashes (058c610, f2476e4) found in git log.

---
*Phase: 03-email-ui-ota-parsing*
*Completed: 2026-02-20*
