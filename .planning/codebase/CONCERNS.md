# Codebase Concerns

**Analysis Date:** 2026-02-19

## Tech Debt

### Type Safety: `as unknown` / `as any` Patterns

**Issue:** 18+ instances of type coercions in service layers to force Prisma results into Record types for audit logging and change detection
**Files:**
- `packages/backend/src/modules/rooms/room.service.ts` (11 instances)
- `packages/backend/src/modules/events/event.service.ts` (3 instances)
- `packages/backend/src/modules/guests/guest.service.ts` (1 instance)
- `packages/backend/src/modules/inbox/conversation.service.ts` (1 instance)
- `packages/backend/src/modules/inbox/message.service.ts` (1 instance)

**Impact:** Type checker bypassed, harder to catch bugs at compile time, makes refactoring risky
**Fix approach:** Create proper generic function signature for `computeChanges()` that accepts specific entity types and preserves type information through Prisma include chains

---

### API_KEY Minimum Length Inconsistency

**Issue:** Env validation requires `API_KEY: z.string().min(8)` but FIXES_APPLIED.md states it was updated to min 32 characters
**Files:** `packages/backend/src/config/env.ts:14`
**Impact:** Configuration mismatch could allow weak API keys if env validation not enforced
**Fix approach:** Update env schema to enforce `min(32)` and document in .env.example

---

### Prisma Connection Pooling Not Configured

**Issue:** PrismaClient instantiated without connection pool limits or PgBouncer configuration
**Files:** `packages/backend/src/plugins/prisma.ts`
**Impact:** Under heavy load (100+ concurrent requests), database connection exhaustion possible
**Fix approach:** Add connection pool config to DATABASE_URL or configure Prisma with explicit `pool_size` parameter; add connection pool metrics to health check

---

## Known Bugs

### Frontend ESLint Missing During Build

**Issue:** Build warns "ESLint must be installed in order to run during builds: pnpm install --save-dev eslint"
**Files:** `packages/frontend/`
**Impact:** Build succeeds but linting step skipped; style/quality issues not caught at build time
**Trigger:** `pnpm build` or `pnpm run build` in frontend package
**Workaround:** Run `pnpm install` to add eslint as devDependency

---

### Assistant Package Has No Tests

**Issue:** `packages/assistant/src/` has no `.test.ts` or `.spec.ts` files; assistant is not yet implemented (E8 phase)
**Files:** `packages/assistant/`
**Impact:** `pnpm test` fails when trying to run assistant tests (exits with code 1)
**Trigger:** Run `pnpm test` at root
**Workaround:** `pnpm test --filter=@pyr/backend --filter=@pyr/frontend` to skip assistant

---

### Error Boundary Logging Not Hooked to Service

**Issue:** Error boundary has TODO comment for production error tracking (Sentry)
**Files:** `packages/frontend/src/components/error-boundary.tsx:33`
**Impact:** Production errors not captured or reported; debugging crashes requires user contact
**Fix approach:** Integrate Sentry or similar error tracking service in production

---

## Security Considerations

### JWT Secret Minimum Length Not Enforced in Tests

**Issue:** Test environment may not validate JWT_SECRET min length (32 chars) if .env.test not properly configured
**Files:** `packages/backend/src/config/env.ts:13`
**Impact:** Test suite could pass with weak JWT secret, testing false security assumption
**Recommendations:** Ensure test database config in `vitest.config.ts` or `beforeAll` hooks loads proper JWT_SECRET

---

### API Key Timing Attack Mitigation

**Status:** FIXED ✅ - Uses `crypto.timingSafeEqual()` as of recent audit
**Files:** `packages/backend/src/plugins/auth.ts`
**Note:** Protection in place, but requires API_KEY to be 32+ chars (see above)

---

## Performance Bottlenecks

### Guest Detail Page N+1 Query Pattern

**Issue:** `getGuest()` in `packages/backend/src/modules/guests/guest.service.ts` (lines 50-98) includes all nested relations: bookings with roomType, eventBookings with event, conversations with counts
**Files:** `packages/backend/src/modules/guests/guest.service.ts:50-98`
**Cause:** Single Prisma query with deep `include` chains; fine for single guest fetch but becomes slow with many guests
**Improvement path:**
- Add `select` clauses to limit columns returned (only what UI needs)
- Consider separate queries for timeline vs. summary stats (guest list vs. detail page)
- Add caching layer (Redis) for read-heavy guest detail requests

---

### Room Availability Calculation in Loop

**Issue:** `checkAvailability()` in `packages/backend/src/modules/rooms/room.service.ts` (lines 318-326) loops through nights and searches for season for each night
**Files:** `packages/backend/src/modules/rooms/room.service.ts:318-326`
**Cause:** O(nights × seasons) complexity; for 7-day booking with 8+ seasons = 56+ operations
**Improvement path:**
- Build a sorted season index once, use binary search per night instead of `find()`
- Cache season list in Redis with TTL (seasons rarely change)
- Consider pre-computing seasonal pricing tiers

---

### Dashboard Stats Endpoint May Slow Down Over Time

**Issue:** No indices or grouping optimization visible in dashboard queries (KPI calculation)
**Files:** `packages/backend/src/modules/dashboard/dashboard.service.ts`
**Cause:** Unknown — need to verify queries, but likely aggregating over large booking/event tables
**Improvement path:**
- Add database indices on `bookings.status`, `bookings.createdAt`, `event_bookings.createdAt`
- Consider materialized views for rolling statistics
- Add query execution time logging with pino to catch regressions

---

## Fragile Areas

### Email Threading Header Matching

**Issue:** Email threading depends on `In-Reply-To` and `References` headers being present and correctly formatted
**Files:** `packages/backend/src/modules/inbox/` (E4 implementation pending)
**Why fragile:** Third-party clients may not set headers correctly; regex parsing OTA emails is brittle
**Safe modification:**
- Test against real emails from Tripaneer, BookYogaRetreats, Gmail, Outlook before deploying
- Add fallback: if headers missing, use fuzzy matching on sender + subject line
- Log all unparseable emails for Ines to review

**Test coverage:** None yet (E4 not started)

---

### Season Price Multiplier Decimal Precision

**Issue:** Season.priceMultiplier is Decimal type; must call `.toString()` before arithmetic to avoid IEEE 754 drift
**Files:** `packages/backend/src/modules/rooms/room.service.ts:325,334`
**Why fragile:** Easy to forget `.toString()` and accumulate floating-point errors over many nights
**Safe modification:**
- Create helper function `decimalToNumber(d: Decimal): number` in `lib/decimal-helpers.ts`
- Use consistently in pricing calculations
- Add unit test with 7-day booking spanning multiple seasons to verify total matches manual calculation

**Test coverage:** ✅ Present in `packages/backend/src/modules/rooms/room.test.ts` but should add more season edge cases

---

### Rate Limiting Disabled in Test Mode

**Issue:** Rate limiter bypassed when `NODE_ENV === 'test'` to avoid cross-test interference
**Files:** `packages/backend/src/app.ts:63-68`
**Why fragile:** Tests don't validate rate limit behavior; production endpoint vulnerable if thresholds are too high (100 req/min default)
**Safe modification:**
- Keep test bypass but add separate integration test with rate limiting enabled
- Run with dedicated test flag `--with-rate-limits` to catch regressions
- Document in TESTING.md

**Test coverage:** No rate limit tests exist

---

### Swagger Disabled in Production

**Status:** ✅ Correctly implemented (line 71 checks NODE_ENV)
**Files:** `packages/backend/src/app.ts:71`
**Note:** Good practice; prevents API schema exposure in production

---

## Scaling Limits

### Single-Threaded Node.js Event Loop

**Limit:** Node.js single-threaded; Fastify handles ~5K req/sec on modern hardware, but CPU-heavy AI inference blocks the loop
**Files:** All backend modules
**Impact:** When AI engine adds inference latency, response times spike; blocking other requests
**Scaling path:**
- Offload AI inference to background queue (BullMQ + worker processes) for non-critical drafts
- Return draft generation as async job; Ines checks dashboard for "ready to review" flag
- Keep synchronous inference only for critical path (e.g., availability checks)

---

### Database Connection Pool Limit

**Current:** PrismaClient uses libpq default (20 connections)
**Limit:** ~20 concurrent database clients before connection exhaustion
**Impact:** With Fastify handling 100 req/sec but queries taking 50-100ms, connection pool exhausted
**Scaling path:**
- Configure pool size: `?max_pool_size=40` in DATABASE_URL
- Monitor active connections with `SELECT count(*) FROM pg_stat_activity`
- Consider connection pooling middleware (PgBouncer) in production

---

### Redis Single Instance (No Cluster)

**Current:** Single Redis instance, no replication or cluster
**Limit:** ~50K ops/sec on moderate hardware; no failover if instance fails
**Impact:** Session loss, cache bypass, job queue hangs if Redis goes down
**Scaling path:** Not critical for MVP, but for Phase 2+:
- Add Redis Sentinel for automatic failover
- Use Redis Cluster for horizontal scale
- For now, add monitoring alert if Redis unreachable

---

## Dependencies at Risk

### Nodemailer CVE-2025-14874 (Fixed)

**Status:** ✅ Already addressed in FIXES_APPLIED.md
**Issue:** Upgraded from 6.9.16 → 7.0.11
**Files:** `packages/backend/package.json`

---

### Next.js Middleware Auth Race Condition

**Risk:** Frontend auth context race condition on initial page load (mentioned in FIXES_APPLIED.md)
**Impact:** User briefly sees protected page content before 401 redirect
**Current:** Using AuthProvider + useAuth hook; no Next.js middleware
**Recommendation:** Migrate to Next.js middleware for auth checks before page render
**Migration plan:**
- Create `middleware.ts` at root of `packages/frontend/src/`
- Validate JWT in cookie before allowing access to protected routes
- Redirect to `/login` if invalid
- Reduces visual flash and improves security

---

### React Query Default Retry Logic

**Status:** Moderate risk
**Issue:** QueryClient defaults to `retry: 1` and `refetchOnWindowFocus: true`
**Files:** `packages/frontend/src/lib/query-client.ts:8-9`
**Impact:** Failed requests automatically retry; can mask underlying API issues. Refetch on focus may create UX jank if data stale
**Recommendation:**
- For critical mutations (create booking, send message), disable retry: `{ retry: false }`
- For read-only queries, keep default but add `staleTime: 30_000` to reduce refetch frequency
- Consider exponential backoff: `retry: (failureCount) => failureCount < 3`

---

## Missing Critical Features

### Error Tracking in Production

**Problem:** No error tracking service configured (Sentry, DataDog, etc.)
**Blocks:** Production debugging; critical bugs not surfaced until user reports
**Impact:** High MTTR (mean time to recovery) on production incidents
**Priority:** High - Should be added before public release
**Implementation:** Add Sentry client to both backend and frontend; configure in production env only

---

### Database Backup and Recovery Plan

**Problem:** No automated backups mentioned; single PostgreSQL instance
**Blocks:** Data loss scenario has no recovery path
**Impact:** Catastrophic if production database corrupted or lost
**Priority:** Critical - Must be in place before production
**Implementation:**
- Configure PostgreSQL `pg_dump` + S3 nightly backups (Hetzner offers backup snapshots)
- Document recovery procedure
- Test recovery monthly

---

### Monitoring and Alerting

**Problem:** Health check exists (`/health`) but no continuous monitoring or alerts
**Blocks:** Production outages not detected until user reports
**Impact:** Downtime extends before team knows
**Priority:** High
**Implementation:** Configure monitoring (UptimeRobot, Grafana, or Hetzner Cloud Monitoring) to alert on:
- API endpoint latency > 1s
- Database connection errors
- Redis unavailable
- 5xx error rate spike

---

## Test Coverage Gaps

### Email Threading and OTA Parsing (E4 Not Started)

**What's not tested:** Message deduplication, email header parsing, OTA vendor-specific formats
**Files:** `packages/backend/src/modules/inbox/` (not implemented)
**Risk:** Email ingestion likely to have bugs; threading broken for multi-recipient conversations
**Priority:** High - Critical path for MVP functionality
**Test approach:** Create fixtures for real emails from Tripaneer, BookYogaRetreats, Gmail; verify threading and deduplication

---

### AI Draft Generation (E6 Not Started)

**What's not tested:** Prompt engineering, token counting, multi-language responses, context window management
**Files:** `packages/backend/src/services/ai-engine/` (not implemented)
**Risk:** AI drafts may be inaccurate, off-brand, or cost-prohibitive (token overruns)
**Priority:** High
**Test approach:** Unit tests on system prompt templates; integration tests on Claude API with mock responses; cost logging validation

---

### Calendar Sync and CalDAV (E7 Not Started)

**What's not tested:** CalDAV protocol compliance, iCloud authentication, event sync bidirectionality checks
**Files:** `packages/backend/src/modules/calendar/` (stub only)
**Risk:** Calendar events not syncing; partial sync corruption
**Priority:** High
**Test approach:** Mock CalDAV server; verify one-way data flow DB → calendar

---

### Personal AI Assistant (E8 Not Started)

**What's not tested:** Telegram bot command parsing, NLU routing, tool invocation chaining
**Files:** `packages/assistant/src/` (empty)
**Risk:** Assistant responds incorrectly; permission checks bypass
**Priority:** Medium (Phase 2 feature in MVP, but critical for daily UX)
**Test approach:** Unit tests on agent NLU logic; integration tests with Telegram bot API mock

---

### Rate Limiting Behavior

**What's not tested:** Rate limit thresholds, IP-based limiting, bypass for admin, exponential backoff
**Files:** `packages/backend/src/app.ts:64-67` (registered but disabled in test)
**Risk:** API easily exhausted by bots or accidental client loops
**Priority:** Medium
**Test approach:** Dedicated test suite with rate limiting enabled; verify 429 after threshold

---

### Cascade Delete Behavior (Events)

**What's not tested:** Deleting an event cascades to event_bookings and calendar_events; data consistency after cascade
**Files:** `packages/backend/src/modules/events/event.service.ts`
**Risk:** Orphaned records or broken references if cascade not working
**Priority:** Medium
**Test approach:** Delete event, verify event_bookings and calendar_events also deleted; audit log captures all deletes

---

## Architecture Issues

### Missing Error Boundary Coverage

**Issue:** Route-level error boundaries defined but not used on pages
**Files:** `packages/frontend/src/components/error-boundary.tsx:98-129`
**Impact:** Uncaught errors bubble up to root; entire dashboard crashes instead of single page failing gracefully
**Fix approach:** Wrap each dashboard route group in `<RouteErrorBoundary>`:
```tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteErrorBoundary>
      <DashboardNav />
      {children}
    </RouteErrorBoundary>
  );
}
```

---

### Missing E4, E6, E7, E8 Implementation Status

**Status Summary:**
| Epic | Status | Completeness |
|------|--------|--------------|
| E1 - Setup | ✅ Complete | 100% |
| E2 - Database & API | ✅ Complete | 100% |
| E3 - CRM | ✅ Complete | 100% |
| E4 - Email Inbox | ❌ Not Started | 0% |
| E5 - Dashboard | ✅ Complete | 100% |
| E6 - AI Engine | ❌ Not Started | 0% |
| E7 - Calendar Sync | ❌ Not Started | 0% (stub only) |
| E8 - AI Assistant | ❌ Not Started | 0% (empty) |
| E9 - Testing & Launch | ❌ Not Started | 0% |

**Impact:** MVP scope is at risk; E4, E6, E7, E8 are blocking features
**Path:** Prioritize E4 (email) and E6 (AI drafting) as they enable core workflow; E7 and E8 are supplementary

---

## Configuration Issues

### Missing `TZ=Europe/Nicosia` in Docker Compose

**Issue:** Docker containers may run on UTC; Cyprus uses EEST (UTC+2/+3)
**Files:** `docker-compose.yml` (not checked, assumed issue from FIXES_APPLIED.md)
**Impact:** Booking dates and event times display incorrectly if timezone wrong
**Fix approach:** Add `TZ=Europe/Nicosia` to backend and frontend environment in docker-compose.yml

---

### .env.example Out of Sync

**Issue:** After security updates (API_KEY min 32), .env.example may not reflect current requirements
**Files:** `.env.example` (not found in repo, likely in .gitignore)
**Impact:** Developers or production setup copy old .env.example and fail on startup
**Fix approach:** Create `.env.example` in repo root with all required vars and current constraints:
```
API_KEY=<32+ character key>
JWT_SECRET=<32+ character secret>
IMAP_HOST=imap.gmx.net
...
```

---

## Summary: Priority Order

| Priority | Category | Fix Effort | Impact |
|----------|----------|-----------|--------|
| **CRITICAL** | E4, E6, E7, E8 implementation | 40+ days | Blocks MVP launch |
| **HIGH** | Database backups & recovery | 2 days | Data loss prevention |
| **HIGH** | Error tracking (Sentry) | 1 day | Production observability |
| **HIGH** | Connection pooling config | 1 day | Prevents production outages |
| **HIGH** | Next.js middleware auth | 2 days | Reduces security risk |
| **MEDIUM** | Type safety (as unknown) | 3 days | Code quality, maintainability |
| **MEDIUM** | Rate limiting tests | 1 day | Prevents DoS |
| **MEDIUM** | Season pricing unit tests | 0.5 days | Catches regressions |
| **MEDIUM** | Error boundary wiring | 0.5 days | UX resilience |
| **LOW** | ESLint setup | 0.5 days | Build consistency |
| **LOW** | Timezone config | 0.5 days | Date display correctness |

---

*Concerns audit: 2026-02-19*
