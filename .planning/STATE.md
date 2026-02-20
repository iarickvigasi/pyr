# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Ines can manage her entire business from one system -- see every guest, booking, and message in one place, get AI-drafted replies she approves with one tap, and control everything via the AI assistant.
**Current focus:** Phase 6 - CalDAV Calendar Sync

## Current Position

Phase: 6 of 9 (CalDAV Calendar Sync)
Plan: 3 of 4 in current phase
Status: Executing Phase 06
Last activity: 2026-02-20 -- Completed 06-03-PLAN.md (Calendar API Endpoints & CalDAV Settings UI)

Progress: [▓▓▓▓▓▓▓▓▓░] 60%

## Performance Metrics

**Velocity:**
- Total plans completed: 21
- Average duration: 6min
- Total execution time: 2.15 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-queue-module-foundation | 2/2 | 15min | 7.5min |
| 02-email-ingestion-pipeline | 6/6 | 34min | 5.7min |
| 03-email-ui-ota-parsing | 3/3 | 32min | 10.7min |
| 04-ai-communication-engine | 4/4 | 20min | 5.0min |
| 05-ai-email-integration | 4/4 | 23min | 5.8min |
| 06-caldav-calendar-sync | 3/4 | 19min | 6.3min |

**Recent Trend:**
- Last 5 plans: 4min, 5min, 5min, 9min, 5min
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
- [03-03]: OTA parser uses strategy pattern with registry -- new platforms added by implementing OtaParser interface
- [03-03]: Multi-strategy extraction: label-based regex with fallback patterns for varying email formats
- [03-03]: OTA booking auto-creation uses direct Prisma calls (not booking service) to avoid validation rejection of incomplete bookings
- [03-03]: Guest matching order: email match first, name match second, create new guest third
- [03-03]: First available room auto-assigned for OTA bookings -- Ines reassigns later
- [03-03]: Placeholder dates (today/tomorrow) when OTA email lacks check-in/check-out -- needsReview=true alerts Ines
- [04-01]: Manual Prisma migration (migrate deploy) instead of migrate dev due to prior migration drift
- [04-01]: Docker Compose default network instead of explicit named network -- all services share default bridge
- [04-01]: Agent API uses same auth as other modules (JWT + API key) -- OpenClaw authenticates via PYR_API_KEY
- [04-01]: Room availability counts rooms with any overlapping booking as booked (simplified for AI summary)
- [04-02]: Pattern-only classification (no LLM) for edge-case detection -- zero cost, instant, sufficient for EN/DE
- [04-02]: Cost stored as EUR microcents (EUR * 100,000) for 5 decimal places of precision
- [04-02]: MODEL_PRICING prefix matching sorted longest-first to prevent gpt-4o matching gpt-4o-mini
- [04-02]: BRAND_VOICE_PREFIX at 5449 chars exceeds Anthropic 1024-token prompt caching minimum
- [04-03]: Draft generator calls OpenClaw via standard HTTP fetch -- no direct LLM SDK imports in backend
- [04-03]: Provider-prefixed model names stripped before cost calculation -- OpenClaw returns 'anthropic/model-name'
- [04-03]: BullMQ job processor deduplicates by checking for existing pending draft per conversation
- [04-03]: classifyMessage uses pattern-based detection only (no LLM call) -- edge-case flags at zero cost
- [04-03]: healthCheck treats OpenClaw Gateway reachability as proxy for both primary/fallback provider health
- [04-04]: Backward compat: show legacy tokensUsed when inputTokens is 0 for old drafts
- [04-04]: Destructive badge variant for complaint/cancellation flags; amber outline for medical/dietary/adoption
- [04-04]: Euro sign (U+20AC) prefix on formatCostMicrocents output for display clarity
- [05-01]: SMTP send before transaction commit in approveDraft -- consistent with existing reply pattern
- [05-01]: Per-message dedup (not per-conversation) in AI draft job processor -- each message gets own draft
- [05-01]: onFailed handler writes empty failed draft record for frontend detection
- [05-01]: Draft enqueueing wrapped in try/catch so failures never block email processing
- [05-01]: Regenerate rejects old draft and enqueues new job (no history kept)
- [05-02]: Hard delete for FAQ entries -- ephemeral content, not core business data
- [05-02]: All FAQs injected into every prompt -- LLM naturally selects relevant ones (10-50 entries within token limits)
- [05-02]: Response schema uses z.date() for Prisma Date fields -- Fastify serializer handles Date-to-string
- [05-03]: Two-step approve uses shadcn Dialog with preview content and explicit Send Email confirmation
- [05-03]: Rejected drafts show grayed-out with strikethrough and Generate new draft button
- [05-03]: Failed drafts detected via 5-second polling (same as pending drafts) -- no separate error mechanism
- [05-03]: Manual reply composer always visible regardless of draft state
- [05-03]: FAQ tag filtering uses client-side Set dedup from loaded FAQ data
- [05-04]: mockImplementation over mockReturnValue for vi.mock factories to survive vi.clearAllMocks between tests
- [05-04]: vi.restoreAllMocks avoided in afterEach for tests using vi.mock module factories (restoreAllMocks resets factory implementations)
- [05-04]: Dedup test verifies per-message scope by testing findFirst query patterns rather than running full BullMQ job processor
- [Phase 06]: [06-01]: CalDAV credentials in Settings table (encrypted, same pattern as email_provider) with env var fallback
- [Phase 06]: [06-01]: All-day booking VEVENT end date = checkOut + 1 day per RFC 5545 non-inclusive DTEND rule
- [Phase 06]: [06-01]: Event durations from type mapping (puppy_yoga:90, beach_walk:120, coffee_cake_cuddles:60) -- no DB field needed
- [Phase 06]: [06-01]: CalDAV client cached as lazy singleton with resetCaldavClient() for credential changes
- [Phase 06]: [06-02]: Sync job enqueueing in route handlers (not services) to keep services pure -- same pattern as AI draft enqueueing
- [Phase 06]: [06-02]: Event DELETE syncs [CANCELLED] to calendar synchronously before hard-delete (DB cascade prevents async BullMQ approach)
- [Phase 06]: [06-02]: Payment status uses simple heuristic (totalPrice > 0 = Unpaid) for MVP -- no payment model queries
- [Phase 06]: [06-03]: CalDAV config saved via same encrypted Settings pattern as email_provider -- saveCaldavConfig calls resetCaldavClient()
- [Phase 06]: [06-03]: Test connection saves config first then tests -- ensures latest credentials used for validation
- [Phase 06]: [06-03]: Sync status banner polls /api/v1/calendar/status every 60s -- shown above settings tabs regardless of active tab
- [Phase 06]: [06-03]: resyncAll includes all bookings (even cancelled) since cancelled need [CANCELLED] prefix in calendar

### Pending Todos

None yet.

### Blockers/Concerns

- Anthropic SDK needs version bump (0.39 -> 0.77) for betaZodTool/toolRunner APIs -- Phase 4
- iCloud CalDAV has undocumented quirks -- test with real account early in Phase 6
- GMX SMTP rate limits unknown -- test during Phase 2 development

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 06-03-PLAN.md (Calendar API Endpoints & CalDAV Settings UI)
Resume file: .planning/phases/06-caldav-calendar-sync/06-04-PLAN.md
