# Project Research Summary

**Project:** PYR Email Inbox Rework with OpenClaw AI Classification
**Domain:** AI-classified business email inbox with guest matching and draft generation
**Researched:** 2026-03-01
**Confidence:** HIGH

## Executive Summary

The PYR inbox rework replaces a rules-based email classifier and auto-guest-creation pipeline with an OpenClaw-powered agent classification system and manual-trigger draft generation. The existing stack (TypeScript/Fastify/Next.js/Prisma/BullMQ/Redis) is fixed and not under evaluation — the change is architectural: moving email classification from synchronous inline rules to async BullMQ-queued OpenClaw agent sessions. The recommended approach mirrors the existing draft generation pattern (`GatewayWsClient` RPC + chat event accumulation), adding a dedicated `ai-classify` queue and a new `classify_email` plugin tool that the agent calls to write classification results directly to the database. All UI components needed (Tabs, Badge, Alert, Skeleton) are already installed in the component library.

The single most important architectural decision is decoupling classification from the email poll loop. OpenClaw agent sessions take 5-30 seconds per email; keeping classification inline would block IMAP polling, causing a cascading backlog. The recommended pattern stores emails immediately with `classification: null`, enqueues an async classify job, and lets the UI show a "Classifying..." spinner until the result arrives via React Query polling. A two-tier pre-filter (keep the existing `email-classifier.ts` rules as fast-path) eliminates ~40-60% of emails before they reach the agent, controlling token costs and gateway load.

The three key risks are: (1) classification latency blocking email polling if the decoupling is not implemented correctly from the start — this requires a foundational architecture decision before any other work; (2) token cost explosion if all emails — including obvious spam, OTA notifications, and system messages — trigger full agent sessions ($30-150/month for classification alone without pre-filtering); and (3) a race condition in the UI where async classification results cause emails to "jump" between tabs while Ines is reading them. All three risks have clear mitigations defined in research and must be addressed in the first phase of implementation.

---

## Key Findings

### Recommended Stack

The stack is entirely additive — no existing packages are replaced. The only new backend dependency is `email-reply-parser` (v2.3.5) for stripping quoted reply content before sending email bodies to the classification agent. All UI components (Tabs, Badge, Alert, Skeleton) are already installed. The classification pipeline reuses the same `GatewayWsClient`, BullMQ infrastructure, and `gateway.request('agent', ...)` pattern already proven in draft generation.

**Core technologies:**
- `email-reply-parser` v2.3.5: Strip quoted content from email replies before AI classification — reduces token usage and classification noise
- BullMQ `EMAIL_CLASSIFY` queue (new): Separate from `ai-draft` queue for independent concurrency, retry strategy, and priority tuning
- BullMQ step jobs pattern: Linear pipeline (pre-classify → AI classify → post-classify) with conditional early exit for rules-matched emails
- `GatewayWsClient` (existing): Reused for classify sessions via same `gateway.request('agent', ...)` pattern as draft generation
- `classify_email` plugin tool (new): Agent calls this structured tool instead of returning parseable JSON text — eliminates brittle text parsing
- shadcn/ui `Tabs` (already installed): Three-tab inbox layout (Conversations / OTA / Other)
- shadcn/ui `Alert` (already installed): Inline guest-match banner for unmatched conversations

**Critical version note:** `email-reply-parser` ships its own `.d.ts` types since v2.0.1; no `@types/` package needed. Uses default ESM import.

### Expected Features

**Must have (table stakes) — launch blockers:**
- AI classification on email ingest — OpenClaw agent session per new conversation, async via BullMQ
- Three-tab inbox (Conversations / OTA / Other) — filter on `classification` field, tabs already match Ines's mental model
- Classification confidence and reasoning display — builds trust, shows "why" the AI decided as it did
- Manual reclassification (existing `ReclassifyDropdown`) — one-click override when AI is wrong
- Guest matching during classification — agent uses `search_guests` tool to auto-link conversations
- Unmatched guest banner with one-click create — replaces auto-creation with an explicit UI prompt
- Manual draft generation (button-triggered) — replaces auto-draft-on-arrival; existing button wired to OpenClaw draft hook with full tool access
- Draft review/edit/approve/reject flow — already fully built in `DraftCard`; keep as-is
- Graceful degradation when gateway is down — BullMQ retry + "Classification pending" state in UI

**Should have (differentiators) — add in v1.x after validation:**
- Guest info extraction during classification — agent extracts name, phone, dates, party size, dietary needs into `classificationMeta`
- OTA guest matching suggestions — "This booking might be for [existing guest]" in OTA tab
- Edge-case flags in classification — move complaint/cancellation/medical flags from draft-time to classify-time
- Classification accuracy tracking — log AI vs. manual overrides; dashboard widget after data accumulates

**Defer (v2+):**
- Batch reclassification — select and reclassify multiple conversations at once
- Classification prompt tuning UI — let Ines provide feedback that improves the prompt (developer work for now)
- AI-suggested actions in conversation — blurs inbox/assistant boundary (Koda already handles this)
- Multi-channel classification — WhatsApp/Instagram through same pipeline (Phase 3 channel expansion)

**Anti-features (explicitly not building):**
- Auto-create guests from emails — was building this, it pollutes the CRM; replaced by manual banner
- Auto-send AI drafts — core business rule violation; always require human approval
- Auto-create bookings from OTA emails — OTA parsers are not 100% accurate; show parsed data for manual action
- Bulk AI draft generation — expensive, wasteful, floods inbox with pending drafts

### Architecture Approach

The classification pipeline is a chain of BullMQ jobs, not a monolithic inline process. The email poll worker stores each message immediately (fast, ~200ms), then enqueues an async classify job and moves to the next email. The classify worker runs a gateway agent session using the same RPC pattern as draft generation. The agent uses `search_guests` and `get_conversation` tools, then calls a new `classify_email` tool with the structured result, which writes directly to the database via the REST API. The frontend polls for classification updates via React Query; no WebSocket push to frontend is needed at current scale. The draft worker remains unchanged in pattern but is now exclusively manual-trigger (no auto-enqueue from email pipeline).

**Major components:**
1. **Email Poll Worker** (reworked): Remove inline `classifyEmail()` and `matchOrCreateGuest()` calls; store message with `classification: null`, enqueue classify job
2. **Classify Worker** (new): `ai-classify.job.ts` + `classify-session.ts`; runs OpenClaw agent session, writes result via `classify_email` tool
3. **classify_email plugin tool** (new): Registered in `openclaw-plugin/tools/conversations.ts`; agent calls this with structured result, tool calls `PATCH /api/v1/conversations/:id`
4. **Classify Skill** (new): `openclaw/workspace/skills/classify/SKILL.md`; classification instructions, categories, tool usage guidance
5. **Three-tab inbox UI** (reworked): `inbox-page.tsx` with shadcn/ui Tabs; filter by `classification` field; unclassified state shows spinner
6. **Guest-match banner** (new): Inline `Alert` on conversations where `guestId` is null and classification is `guest_inquiry`
7. **GatewayWsClient** (unchanged): Shared single WebSocket connection for classify, draft, and notifications

**Build order (strict dependency chain):**
- Phase A (Foundation): Schema migration → `classify_email` plugin tool → classify skill → hook mapping
- Phase B (Backend Pipeline): `ai-classify` queue + worker → email pipeline rework → draft generator verification
- Phase C (API + Frontend): Inbox route updates → three-tab UI → guest-match banner → OTA display → draft trigger
- Phase D (Cleanup + Testing): Remove dead code (`email-classifier.ts`, `contact-matcher.ts`) → integration tests → gateway-down validation

### Critical Pitfalls

1. **Classification latency blocking email polling** — NEVER call the gateway inside the poll loop. OpenClaw sessions take 5-30 seconds; inline classification causes cascading backlog. Store the message immediately, enqueue a classify job, return. This is a foundational architecture decision and fixing it later requires rewriting the entire inbound flow.

2. **Token cost explosion from full agent sessions on every email** — Keep the existing `email-classifier.ts` rules as a two-tier pre-filter. Obvious OTA senders (tripaneer.com, bookyogaretreats.com), system addresses, and spam patterns should short-circuit before reaching the OpenClaw agent. This saves 40-60% of classification sessions. Also: use a lighter model (Claude Haiku) for classification, not Sonnet — classification is a structured output task that does not need a large model.

3. **Race condition: emails jumping tabs during async classification** — The three-tab UI must be designed around async classification from the start. Show an "Unclassified" state (spinner) for emails awaiting classification. Never move a conversation between tabs while it is currently selected/open. Use React Query `refetchInterval` (10-15s) to pick up classification updates. Manual reclassifications must not be overwriteable by late-arriving async classification results.

4. **Gateway unavailability leaving emails in limbo** — Decouple per Pitfall 1 (message stored regardless). Classification BullMQ jobs retry with exponential backoff (3x). After all retries, set `classificationStatus: 'failed'`; frontend shows "Classification failed" badge. Manual reclassify dropdown always available as fallback. Consider minimal rules-based degraded-mode classifier as a last resort.

5. **Agent returning unstructured text instead of structured classification** — Never ask the agent to "respond with JSON." Instead, register a `classify_email` plugin tool with a typed parameter schema. The agent calls the tool as its action; tool validation catches schema errors; the backend worker just needs to detect session completion via the `final` chat event, not parse content.

---

## Implications for Roadmap

Based on research, the dependency chain from ARCHITECTURE.md defines a clear four-phase build order. Items within each phase can be parallelized; items across phases cannot.

### Phase 1: Foundation and Schema
**Rationale:** Everything else depends on the new database fields and the `classify_email` plugin tool. Schema migrations must precede any worker or UI code. The classify skill and hook mapping enable the agent session to run. This phase has no runtime dependencies and can be built and tested in isolation.
**Delivers:** New Prisma fields (`classifiedAt`, `classifyJobId`, `guestMatchSource`, `otaParsedData`, `classificationConfidence`, `classificationSource`, `classificationMeta`), updated `PATCH /api/v1/conversations/:id` endpoint accepting classification data, `classify_email` plugin tool, classify skill file, `classify` hook in `openclaw.json`, `AI_CLASSIFY` queue name in shared types
**Addresses:** Stale data migration planning (Pitfall 5), structured tool output pattern (avoids Pitfall: unstructured text)
**Avoids:** Building workers before the tool they depend on exists

### Phase 2: Backend Classification Pipeline
**Rationale:** With foundation in place, the async classify pipeline can be built and tested end-to-end without any frontend work. The email poll worker rework (removing inline classification) is the critical change that prevents Pitfall 1. The two-tier pre-filter is added here to prevent Pitfall 4 (cost explosion). Draft generator verification ensures the existing manual flow still works after poll loop changes.
**Delivers:** `ai-classify` BullMQ queue, `classify-session.ts` session runner, `ai-classify.job.ts` processor, reworked email poll worker (store + enqueue only, no inline classify), two-tier pre-filter (rules → agent), draft generator verified as manual-only trigger
**Addresses:** Classification latency blocking polling (Pitfall 1, the most critical), token cost explosion (Pitfall 4), gateway contention (Pitfall 7)
**Avoids:** Gateway session calls inside the poll loop, auto-draft enqueue

### Phase 3: API Updates and Frontend Rework
**Rationale:** With classification data flowing through the backend, the frontend can be built to reflect it. The three-tab inbox must be designed around async classification from day one (Pitfall 3). Guest-match banner and OTA parsed data display are frontend-only additions using already-installed components. This phase is the most visible deliverable.
**Delivers:** Updated conversation list API (classification filter, tab counts, pending state), three-tab inbox UI (shadcn/ui Tabs), classification pending state (spinner per conversation), guest-match banner (shadcn/ui Alert, one-click create), OTA parsed data card, manual "Generate Draft" button wired end-to-end, React Query `refetchInterval` for classification updates
**Addresses:** Race condition in UI (Pitfall 3), unmatched guest flow, OTA data display
**Implements:** Three-tab inbox architecture from ARCHITECTURE.md Flow 3

### Phase 4: Cleanup, Testing, and Validation
**Rationale:** Dead code removal and testing come last so they have the complete new system to validate against. Classification evaluation requires real email samples to define the fixture dataset. Gateway-down testing is explicitly called out in research as often missing. Cost tracking verification catches Pitfall 4 in production.
**Delivers:** Deleted `email-classifier.ts` (as standalone pipeline), deleted `contact-matcher.ts`, integration tests for full email-arrive → classify → guest-link → draft pipeline, classification evaluation fixture dataset (50+ real samples across all categories, threshold-based assertions), gateway-down scenario test, cost tracking verification (classify costs tracked separately from draft costs)
**Addresses:** Non-deterministic AI testing (Pitfall 6), stale data validation (Pitfall 5 — verify old conversations render correctly in three-tab UI)
**Avoids:** Discovering classification accuracy regressions in production

### Phase Ordering Rationale

- **Schema first:** Every other component reads or writes the new fields. Building workers before the migration means schema changes break in-progress work.
- **Backend before frontend:** The three-tab UI is a filter on `classification` field values. Without the classify pipeline producing those values, the UI has nothing to filter on.
- **Pre-filter in Phase 2:** The token cost and gateway load implications are felt immediately when the first real email is classified. Delaying the pre-filter to a later phase means every email triggers a full agent session from the start.
- **Cleanup in Phase 4:** Removing `email-classifier.ts` before the new pipeline is proven would leave the system with no classification at all during the transition. Old code stays until the new system is validated.
- **No Phase for UI without backend:** The frontend three-tab inbox depends on `classifiedAt` being populated. Building the tab UI in parallel with the pipeline would require extensive mocking and then rework when real data arrives.

### Research Flags

Phases likely needing deeper research or careful validation during planning:

- **Phase 2 (Backend Pipeline):** The two-tier pre-filter integration with BullMQ step jobs needs careful design — the exact step boundary between rules-based and AI-based paths, and how to handle the `classifiedBy` field to distinguish provenance.
- **Phase 2 (Draft generator rework):** Verification that the existing draft generator only needs the auto-enqueue removed (not a full rewrite). The current implementation already uses `gateway.request('agent', ...)` — confirm the session key uniqueness and cost attribution are correct for manual-trigger scenarios.
- **Phase 4 (Classification evaluation):** Building the fixture dataset from real production email samples requires access to live data and anonymization judgment. This is not a pure engineering task.

Phases with standard patterns (can skip additional research):

- **Phase 1 (Foundation):** Prisma migration patterns are well-established in the codebase. Plugin tool registration follows existing `conversations.ts` patterns. No new patterns introduced.
- **Phase 3 (UI Rework):** All UI components are installed. shadcn/ui Tabs pattern is documented. React Query tab queries with classification filters are straightforward extensions of existing inbox query patterns.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations are additive to an existing validated stack. Only one new dependency (`email-reply-parser`). All UI components already installed. |
| Features | HIGH | Based on codebase analysis of existing components + competitor analysis (Gmail, Front, Intercom, Superhuman). Anti-features are explicitly called out based on lessons from the current system. |
| Architecture | HIGH | Based on direct codebase analysis of all relevant components. Classification follows the exact same pattern as draft generation, which is already working in production. |
| Pitfalls | HIGH | Most pitfalls are derived from direct analysis of the existing code (e.g., synchronous classification in poll loop, auto-guest-creation path) rather than speculation. |

**Overall confidence:** HIGH

### Gaps to Address

- **OpenClaw agent JSON output reliability:** The `classify_email` tool approach eliminates brittle text parsing, but this depends on the agent reliably calling the tool rather than summarizing in text. Validate with real emails in Phase 2 before removing fallbacks.
- **`franc-min` removal timing:** Research recommends OpenClaw for language detection to replace `franc-min`, but marks this MEDIUM confidence. Keep `franc-min` as a fallback until classification accuracy on language detection is validated with real EN/DE emails. Remove in Phase 4 if validated.
- **Haiku model availability for classification:** Research recommends a lighter model (Claude Haiku) for classification cost reduction. Confirm the OpenClaw gateway configuration supports specifying a different model per hook/session type before committing to this in Phase 1.
- **Historical data rendering:** Existing conversations have `classification` values set by the old rules-based system. Verify the three-tab UI renders them correctly (they should, since the field names are the same) before deploying Phase 3 to production.

---

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis: `email-threader.ts`, `email-classifier.ts`, `contact-matcher.ts`, `draft-generator.ts`, `gateway-ws-client.ts`, `ai-draft.job.ts`, `worker.ts`, `queue.ts`, `inbox-page.tsx`, `draft-card.tsx`, `conversation-thread.tsx`, `reclassify-dropdown.tsx`, `openclaw-plugin/tools/conversations.ts`, `openclaw/openclaw.json`
- BullMQ official documentation: Process Step Jobs, Flows, Workers, Concurrency
- shadcn/ui documentation: Tabs, Badge, Alert components
- `email-reply-parser` v2.3.5 npm package (Jan 2025, active maintenance, ships `.d.ts`)

### Secondary (MEDIUM confidence)
- [Gmail AI Inbox Categorization Guide](https://www.getmailbird.com/gmail-ai-inbox-categorization-guide/) — Inbox tab pattern validation
- [Superhuman AI Features](https://superhuman.com/products/mail/ai) — Human-in-the-loop draft approval patterns
- [Front Review 2026](https://efficient.app/apps/front) — Shared inbox AI capabilities comparison
- [Intercom AI Review 2026](https://reply.io/blog/intercom-ai-review/) — AI triage and routing patterns
- [BullMQ TypeScript setup guide (Jan 2026)](https://oneuptime.com/blog/post/2026-01-21-bullmq-typescript-setup/view) — Recent BullMQ best practices
- [Tribe AI: Reducing LLM Latency and Cost](https://www.tribe.ai/applied-ai/reducing-latency-and-cost-at-scale-llm-performance) — Cost management strategies
- [Maxim AI: LLM Cost Optimization](https://www.getmaxim.ai/articles/llm-cost-optimization-a-guide-to-cutting-ai-spending-without-sacrificing-quality/) — Token optimization and model routing

### Tertiary (MEDIUM-LOW confidence)
- [Block Engineering: Testing Pyramid for AI Agents](https://engineering.block.xyz/blog/testing-pyramid-for-ai-agents) — Evaluation strategies for non-deterministic AI
- [Langfuse: Testing LLM Applications](https://langfuse.com/blog/2025-10-21-testing-llm-applications) — Record/playback, threshold assertions
- [AWS: Optimize LLM Costs with Caching](https://aws.amazon.com/blogs/database/optimize-llm-response-costs-and-latency-with-effective-caching/) — Redis caching for repeated classifications
- [CRM Email Integration Anti-Patterns](https://www.aurinko.io/blog/crm-email-integration-recreating-inbox-mistake/) — Anti-patterns in CRM inbox integration

---
*Research completed: 2026-03-01*
*Ready for roadmap: yes*
