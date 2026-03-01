# Stack Research

**Domain:** Email inbox rework with AI classification and draft generation (OpenClaw integration)
**Researched:** 2026-03-01
**Confidence:** HIGH

## Context

This research covers technology decisions for reworking the PYR email inbox pipeline. The existing system uses rules-based email classification (`email-classifier.ts`) and auto-guest-creation (`contact-matcher.ts`). The new system replaces these with OpenClaw-powered agent sessions for classification and manual-trigger draft generation. The core stack (TypeScript/Fastify/Next.js/Prisma/BullMQ/Redis) is fixed and not under evaluation. This research focuses on four areas: email threading, async AI classification jobs, OpenClaw session patterns, and inbox UI.

---

## Recommended Stack

### 1. Email Threading — Keep Custom Implementation

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Custom `email-threader.ts` | existing | RFC 5322 header-based conversation threading | Already correct, simple, and tested. Matches exactly what the system needs. |
| `email-reply-parser` | ^2.3.5 | Strip quoted reply content from email bodies | Extracts only the new content from replies; removes `>` quoted blocks and signature lines. Needed for clean AI classification input. |
| `mailparser` | ^3.9.3 (already installed) | MIME parsing, header extraction | Already in use. Provides `inReplyTo`, `references`, `messageId` headers that feed threading. |

**Confidence: HIGH** -- The existing threading approach (`findConversationByHeaders` + `buildReferencesChain` + `isForwardedEmail`) is correct RFC 5322 behavior and well-tested. There is no npm library that improves on it for this use case because email threading is about database lookups against stored Message-IDs, not about parsing. The only gap is reply content extraction (stripping quoted text before feeding to AI), which `email-reply-parser` handles.

#### Why NOT to change threading:

- **No "email threading library" exists for this problem.** Threading in a CRM context means "look up which conversation this email belongs to by checking In-Reply-To/References headers against stored Message-IDs." That is a database query, not a library problem. The 57-line `email-threader.ts` does exactly this.
- **Subject-line threading (Re: matching) is intentionally avoided.** It creates false positives when different guests email about the same topic. The current approach is correct to rely on headers only.
- **Forward detection (`isForwardedEmail`) is correct behavior.** Forwarded emails start new conversations because the original context no longer applies.

#### What to add:

`email-reply-parser` (v2.3.5) strips quoted reply content from email bodies. Currently, the full email body (including all quoted previous messages) is sent to OpenClaw for classification. This wastes tokens and confuses classification. Strip it before feeding to the AI agent.

```typescript
import EmailReplyParser from 'email-reply-parser';

// Before sending to OpenClaw classification:
const parser = new EmailReplyParser();
const parsed = parser.read(emailBody);
const newContent = parsed.getVisibleText(); // Only the new reply, no quoted text
```

**TypeScript support:** Ships its own `.d.ts` types since v2.0.1. No `@types/` package needed.

---

### 2. Async AI Classification — BullMQ Single Queue with Step Pattern

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| BullMQ | ^5.34.8 (already installed, latest 5.70.1) | Async job queue for email classification | Already in use for email polling and draft generation. Use the same infrastructure. |
| BullMQ step jobs pattern | built-in | Multi-step classification workflow | Single job with persistent step tracking. Simpler than flows for a linear pipeline. |

**Confidence: HIGH** -- BullMQ is already the project's job queue. The existing patterns in `queue.ts`, `worker.ts`, and `ai-draft.job.ts` are well-established and should be followed for classification.

#### Architecture Decision: New `EMAIL_CLASSIFY` Queue

Add a dedicated queue for classification jobs, separate from the existing `AI_DRAFT` queue.

**Rationale:**
- Classification runs on every inbound email. Draft generation only runs on-demand. Different retry strategies needed.
- Classification is latency-sensitive (Ines wants to see classified emails quickly). Drafts are latency-tolerant (she triggers them manually).
- Separate queues allow independent concurrency tuning and monitoring.

```typescript
// In shared/src/types/jobs.ts:
export interface EmailClassifyJobData {
  conversationId: string;
  messageId: string;
  emailContent: string;     // Stripped reply content
  fromAddress: string;
  fromName: string;
  subject: string;
}

export const QUEUE_NAMES = {
  // ...existing
  EMAIL_CLASSIFY: 'email-classify',
} as const;
```

#### Why Step Jobs, NOT Flows

The classification pipeline is a linear sequence:

1. **Pre-classify** (fast, rules-based): Check if sender is OTA domain, system sender, or spam pattern. If matched with high confidence, skip the AI session entirely (save tokens).
2. **AI classify** (slow, OpenClaw session): Send email content + metadata to OpenClaw for full agent classification with tool access.
3. **Post-classify** (fast, DB write): Update conversation classification, extract guest info, detect language, log results.

This is a **single linear job with conditional early exit**, not a parent-child dependency graph. BullMQ's step jobs pattern fits perfectly:

```typescript
enum ClassifyStep {
  PreClassify = 0,
  AiClassify = 1,
  PostClassify = 2,
  Done = 3,
}
```

**Why NOT BullMQ Flows:**
- Flows are for parent-child dependencies (e.g., "parent waits for N children to complete"). Classification has no fan-out or parallel children.
- Flows require `FlowProducer` class, which adds complexity without benefit for a linear pipeline.
- The existing codebase uses simple `queue.add()` + processor functions, not `FlowProducer`. Consistency matters.

#### Retry Strategy

```typescript
app.queues.createQueue<EmailClassifyJobData>(QUEUE_NAMES.EMAIL_CLASSIFY, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }, // 5s, 10s, 20s
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});
```

#### Pre-Classification Short-Circuit

Keep the existing rules as a fast path to avoid unnecessary AI sessions. The current `email-classifier.ts` patterns (OTA domains, system senders, spam patterns) should become the pre-classify step:

- OTA domain match (tripaneer.com, bookyogaretreats.com, etc.) -> classify as `ota_notification`, skip AI session
- System senders (postmaster@, mailer-daemon@) -> classify as `admin_system`, skip AI session
- Spam patterns (noreply@, newsletter@) -> classify as `spam_newsletter`, skip AI session
- Everything else -> send to OpenClaw AI classification

**This saves tokens and latency for ~40-60% of emails** that are clearly non-guest messages.

---

### 3. OpenClaw Classification Sessions — Gateway Agent RPC

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `GatewayWsClient` | existing | WebSocket RPC to OpenClaw Gateway | Already in use for draft generation. Same pattern for classification. |
| OpenClaw hook mapping: `classify` | new | Named hook endpoint for classification agent sessions | Consistent with existing `draft`, `briefing`, `alert` hook patterns. |
| OpenClaw skill: `classify` | new | Domain knowledge file for classification behavior | Consistent with existing skills (`draft/SKILL.md`, `conversations/SKILL.md`). |

**Confidence: HIGH** -- The existing draft generation in `draft-generator.ts` demonstrates exactly the pattern needed. Classification follows the same architecture:

1. Backend enqueues a BullMQ job
2. Job processor calls `gateway.request('agent', { ... })` with a unique session key
3. Chat events are accumulated until `state === 'final'`
4. Result is parsed and written to DB

#### Hook Configuration

Add a `classify` hook mapping to `openclaw/openclaw.json`:

```json
{
  "match": { "path": "classify" },
  "action": "agent",
  "agentId": "main",
  "sessionKey": "hook:classify:{{message}}",
  "deliver": false
}
```

- `deliver: false` because classification results go to the DB, not to WhatsApp.
- Unique session key per classification to isolate concurrent sessions.

#### Classification Session Contract

The OpenClaw agent receives the email content + metadata as a structured message and returns a JSON classification result. The agent has access to tools like `search_guests`, `get_conversation`, and `list_conversations` to cross-reference data during classification.

**Expected response schema:**

```typescript
interface ClassificationResult {
  category: 'guest_inquiry' | 'ota_notification' | 'spam_newsletter' | 'admin_system';
  confidence: number;       // 0.0 - 1.0
  reason: string;            // Human-readable explanation
  detectedLanguage: 'en' | 'de';
  guestMatch?: {
    guestId: string;
    matchConfidence: number;
    matchMethod: 'email' | 'name' | 'phone';
  };
  extractedInfo?: {
    guestName?: string;
    guestEmail?: string;
    guestPhone?: string;
    subject?: string;
    intent?: string;         // e.g., "booking inquiry", "cancellation", "general question"
  };
}
```

The agent returns this as structured JSON in its final response. The backend parses it from the accumulated `content` string.

#### Language Detection via OpenClaw

**Remove `franc-min` dependency.** The OpenClaw agent naturally detects language during classification (it reads the email content). Having the agent output `detectedLanguage` as part of classification is more accurate than `franc-min`'s trigram approach, especially for short or mixed-language emails.

**Confidence: MEDIUM** -- This depends on the OpenClaw agent reliably outputting structured JSON. The skill file must explicitly instruct structured output. If the agent outputs unstructured text, a fallback to `franc-min` is needed.

---

### 4. Inbox UI — Tabbed Layout with shadcn/ui Tabs + Badge

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| shadcn/ui `Tabs` | already installed | Three-tab inbox layout: Conversations / OTA / Other | Already in the component library. Perfect for the three-category inbox. |
| shadcn/ui `Badge` | already installed | Classification badges with color coding | Already in use via `classification-badge.tsx`. Extend with new categories. |
| `@tanstack/react-query` | ^5.64.1 (already installed) | Server state management for filtered conversation lists | Already used for all data fetching. Each tab gets its own query with classification filter. |
| shadcn/ui `Alert` | already installed | Inline banner for unmatched guests | Clean, non-modal notification pattern. |
| shadcn/ui `Skeleton` | already installed | Loading states | Already used in inbox. |

**Confidence: HIGH** -- All UI components are already installed and in use. This is purely an architectural rearrangement of existing components.

#### Tab Architecture

```
Inbox (Page)
├── Tabs (shadcn/ui)
│   ├── Tab: Conversations (default)
│   │   ├── ConversationList (filtered: guest_inquiry)
│   │   └── ConversationThread
│   │       ├── GuestMatchBanner (new: inline alert for unmatched guests)
│   │       ├── MessageThread (existing)
│   │       ├── DraftCard (existing, but trigger is manual now)
│   │       └── MessageComposer (existing)
│   ├── Tab: OTA
│   │   ├── ConversationList (filtered: ota_notification)
│   │   └── OtaConversationView
│   │       ├── OtaBookingBadge (existing)
│   │       ├── ParsedBookingData (new: shows extracted OTA data)
│   │       └── MessageThread
│   └── Tab: Other
│       ├── ConversationList (filtered: spam_newsletter + admin_system)
│       └── ConversationThread (read-only, no draft generation)
└── TabBadgeCounts (show unread count per tab)
```

#### Tab Query Pattern

Each tab fetches conversations filtered by classification:

```typescript
// useConversations hook extended with classification filter
const { data } = useConversations({ classification: ['guest_inquiry'] });
const { data: otaData } = useConversations({ classification: ['ota_notification'] });
const { data: otherData } = useConversations({ classification: ['spam_newsletter', 'admin_system'] });
```

Tab badge counts come from a lightweight endpoint or are derived from the query results.

#### Guest Match Banner Component

New component for conversations where OpenClaw classification found no matching guest:

```tsx
// Inline alert, not a modal. Non-blocking.
<Alert>
  <AlertDescription>
    No matching guest found.
    <Button variant="link" onClick={() => createGuest(extractedInfo)}>
      Create {extractedInfo.guestName} ({extractedInfo.guestEmail})
    </Button>
  </AlertDescription>
</Alert>
```

Uses shadcn/ui `Alert` component (already installed). Positioned at the top of the conversation thread.

#### Manual Draft Generation Trigger

Replace the automatic draft generation on email arrival with a button:

```tsx
<Button onClick={() => generateDraft.mutate({ conversationId })}>
  <Sparkles className="mr-2 h-4 w-4" />
  Generate Draft
</Button>
```

The existing `DraftCard` component (`draft-card.tsx`) already handles generating, pending, approved, rejected, and failed states. The change is in **when** generation is triggered (manual button click, not automatic on email arrival).

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `email-reply-parser` | ^2.3.5 | Strip quoted content from email replies | Before feeding email body to OpenClaw classification. Reduces token usage and improves classification accuracy. |
| `zod` | ^3.25.76 (already installed) | Parse and validate OpenClaw classification responses | Validate the structured JSON returned by the classification agent session. |

---

## Installation

```bash
# New dependency (packages/backend)
pnpm --filter @pyr/backend add email-reply-parser

# No new frontend dependencies needed
# All UI components (tabs, badge, alert, skeleton) already installed
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Custom email threading (keep existing) | `emailjs/smtp-server` or third-party threading service | Only if building a multi-tenant email client with complex threading needs (folders, labels, search). Not needed for a single-admin CRM. |
| BullMQ single queue + step jobs | BullMQ FlowProducer | Only if classification has fan-out (e.g., classify email then run N independent child analyses in parallel). Current linear pipeline does not need this. |
| BullMQ `EMAIL_CLASSIFY` queue | Inline synchronous classification in email poll loop | Only if classification completes in <500ms. OpenClaw sessions take 5-30s, so async queue is mandatory. |
| OpenClaw agent session via gateway RPC | Direct Anthropic API call via `@anthropic-ai/sdk` | Only if OpenClaw is unavailable. OpenClaw provides tool access during classification, which direct API calls cannot. The whole point is that the classifier can search guests, check bookings, etc. |
| `email-reply-parser` for content stripping | Custom regex-based reply stripping | Only if `email-reply-parser` fails on GMX-formatted emails. GMX uses standard quoting (`>` prefix), so the library should work. Test with real email samples before committing. |
| shadcn/ui Tabs for inbox tabs | Custom tab implementation | Never. shadcn/ui Tabs is already installed, accessible, and keyboard-navigable. |
| Remove `franc-min`, use OpenClaw for language detection | Keep `franc-min` as primary | If OpenClaw classification sessions are unreliable at structured JSON output. Keep `franc-min` as a fallback until the OpenClaw skill is validated with real emails. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `node-email-reply-parser` | Last published 4+ years ago, no TypeScript types, no active maintenance | `email-reply-parser` v2.3.5 (Jan 2025, ships `.d.ts`) |
| `emailreplyparser` (npm) | Port of Python library, last updated 2019, no TS types | `email-reply-parser` v2.3.5 |
| BullMQ `FlowProducer` for classification | Adds complexity for a linear pipeline. Flows are designed for parent-child fan-out, not sequential steps. The existing codebase uses simple queue.add(), not FlowProducer. | BullMQ step jobs pattern (switch on `job.data.step`) |
| Direct HTTP calls to OpenClaw hooks endpoint | The backend already has a persistent WebSocket connection to the gateway (`GatewayWsClient`). HTTP hook calls would bypass the existing connection, lose reconnect/backoff logic, and require separate auth management. | `gateway.request('agent', { ... })` via existing WebSocket client |
| `franc-min` as primary language detector (long-term) | OpenClaw classification already reads the email content and can detect language more accurately. Running a separate trigram analysis is redundant token-free work, but less accurate for short/mixed text. | OpenClaw `detectedLanguage` in classification result. Keep `franc-min` as fallback only. |
| React state management (useState/useReducer) for tab switching | Tab state does not need to be in URL or global state for a single-admin dashboard. But the query filters per tab should use React Query's cache, not local state. | shadcn/ui Tabs (manages active tab internally) + React Query per-tab queries |
| Server-Sent Events for classification status | Classification takes 5-30s. Polling the conversation record for `classification` field changes is simpler and the inbox is already React Query-based with `refetchOnWindowFocus`. | React Query polling or invalidation after classification job completes. |

---

## Stack Patterns by Variant

**If OpenClaw gateway is down during classification:**
- Pre-classify step still runs (rules-based fast path catches OTA/system/spam)
- AI classify step fails, BullMQ retries with exponential backoff (5s, 10s, 20s)
- After 3 failed attempts, write classification as `unclassified` with `classificationStatus: 'failed'`
- Frontend shows "Classification pending" badge. Ines can manually classify via the existing `ReclassifyDropdown`.

**If classification result is ambiguous (low confidence):**
- Store the classification but flag for review: `classificationConfidence < 0.7`
- Frontend shows the classification badge but with a "?" indicator
- Ines can override via the existing reclassify dropdown

**If email-reply-parser fails to strip content properly:**
- Fall back to sending full email body to OpenClaw
- Log a warning for debugging
- The agent can still classify correctly with full body, just uses more tokens

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| BullMQ ^5.34.8 | Redis 7.x | Already validated in the existing stack. BullMQ 5.x requires Redis 6.2+. |
| `email-reply-parser` ^2.3.5 | TypeScript 5.x, ESM | Ships `.d.ts` types. Works with `"type": "module"` in package.json. Verify: `import EmailReplyParser from 'email-reply-parser'` (default export). |
| `mailparser` ^3.9.3 | `email-reply-parser` | Complementary, not competing. `mailparser` extracts headers + body from MIME. `email-reply-parser` strips quoted content from the body text. |
| OpenClaw gateway protocol v3 | `GatewayWsClient` | Existing WebSocket client already implements protocol v3 handshake, RPC correlation, and chat event routing. No changes needed. |
| shadcn/ui Tabs | Radix UI Tabs (via @radix-ui/react-tabs) | shadcn/ui Tabs wraps Radix. Already installed and used in the frontend. |

---

## Database Schema Additions

Two new fields needed on the existing `conversations` table (via Prisma migration):

```prisma
model Conversation {
  // ...existing fields...
  classificationConfidence Float?        // 0.0-1.0 confidence from AI classification
  classificationSource     String?       // 'rules' | 'ai' | 'manual' — how was it classified
  matchedGuestId           String?       // Guest ID from AI matching (before Ines confirms)
  extractedInfo            Json?         // Raw extracted info from AI classification
}
```

And a new field on `messages`:

```prisma
model Message {
  // ...existing fields...
  strippedContent  String?   // Reply content with quoted text removed (for AI input)
}
```

---

## Key Architectural Decisions Summary

| Decision | Rationale | Confidence |
|----------|-----------|------------|
| Keep custom email threading | Correct RFC 5322 behavior, well-tested, no library improves on it | HIGH |
| Add `email-reply-parser` for content stripping | Reduces AI token usage, improves classification accuracy | HIGH |
| New `EMAIL_CLASSIFY` BullMQ queue | Separate from draft queue for independent retry/concurrency | HIGH |
| Step jobs pattern (not flows) | Linear pipeline, not fan-out. Matches existing codebase patterns. | HIGH |
| Pre-classify short-circuit | Saves tokens for obvious OTA/spam/system emails (~40-60% of volume) | HIGH |
| OpenClaw gateway RPC for classification | Consistent with draft generation, provides tool access during classification | HIGH |
| New `classify` hook in openclaw.json | Consistent with existing hook patterns (draft, briefing, alert) | HIGH |
| Remove `franc-min` (long-term) | OpenClaw classification subsumes language detection | MEDIUM |
| shadcn/ui Tabs for three-tab inbox | Already installed, accessible, keyboard-navigable | HIGH |
| Manual draft trigger (not auto) | Saves tokens, respects Ines's workflow | HIGH |

---

## Sources

- BullMQ official documentation: [Process Step Jobs](https://docs.bullmq.io/patterns/process-step-jobs), [Flows](https://docs.bullmq.io/guide/flows), [Workers](https://docs.bullmq.io/guide/workers) -- Confidence: HIGH
- email-reply-parser npm: [v2.3.5](https://www.npmjs.com/package/email-reply-parser) -- TypeScript types since v2.0.1, active maintenance through Jan 2025. Confidence: HIGH
- shadcn/ui documentation: [Tabs](https://ui.shadcn.com/docs/components/radix/tabs), [Badge](https://www.shadcn.io/ui/badge) -- Confidence: HIGH
- [Tabs with Badge Counts pattern](https://www.shadcn.io/patterns/tabs-advanced-1) -- React tabs with badge counts for inbox-style UIs. Confidence: HIGH
- [BullMQ TypeScript setup guide (Jan 2026)](https://oneuptime.com/blog/post/2026-01-21-bullmq-typescript-setup/view) -- Recent best practices. Confidence: MEDIUM
- [BullMQ job dependencies with flows (Jan 2026)](https://oneuptime.com/blog/post/2026-01-21-bullmq-job-dependencies-flows/view) -- Confirms flows are for parent-child, not linear pipelines. Confidence: MEDIUM
- Existing codebase analysis: `email-threader.ts`, `email-classifier.ts`, `draft-generator.ts`, `gateway-ws-client.ts`, `ai-draft.job.ts`, `worker.ts`, `queue.ts`, `inbox-page.tsx` -- Confidence: HIGH (source code)

---
*Stack research for: PYR Email Inbox Rework with OpenClaw AI Classification*
*Researched: 2026-03-01*
