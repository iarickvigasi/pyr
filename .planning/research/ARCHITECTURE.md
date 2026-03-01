# Architecture Research: OpenClaw Classification Pipeline Integration

**Domain:** Email inbox rework with AI classification and draft generation
**Researched:** 2026-03-01
**Confidence:** HIGH (based on direct codebase analysis of all relevant components)

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (Next.js)                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                           │
│  │ Conversations │  │    OTA       │  │    Other     │  ← Three-tab inbox UI     │
│  │    Tab        │  │    Tab       │  │    Tab       │                           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                           │
│         └──────────────────┴──────────────────┘                                  │
│                            │ React Query polling                                 │
├────────────────────────────┼─────────────────────────────────────────────────────┤
│                     Fastify REST API                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                     │
│  │  Inbox Routes  │  │  Agent Routes  │  │  Notification  │                     │
│  │  /conversations│  │  /agent/*      │  │   Service      │                     │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘                     │
│          │                   │                   │                               │
├──────────┼───────────────────┼───────────────────┼───────────────────────────────┤
│                         BullMQ Queues                                            │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │email-poll│  │ ai-classify  │  │  ai-draft    │  │  calendar    │            │
│  │ (exists) │  │ (NEW)        │  │  (reworked)  │  │  (exists)    │            │
│  └────┬─────┘  └──────┬───────┘  └──────┬───────┘  └──────────────┘            │
│       │               │                 │                                        │
├───────┼───────────────┼─────────────────┼────────────────────────────────────────┤
│                   Gateway WebSocket Client                                       │
│  ┌──────────────────────────────────────────────────────┐                        │
│  │  GatewayWsClient (persistent WS, RPC v3)            │                        │
│  │  - request('agent', {...}) → fires chat events      │                        │
│  │  - onChatEvent() → accumulates delta/final/error    │                        │
│  └──────────────────────────┬───────────────────────────┘                        │
│                             │ WebSocket (ws://localhost:18789)                    │
├─────────────────────────────┼────────────────────────────────────────────────────┤
│                      OpenClaw Gateway                                            │
│  ┌─────────┐  ┌──────────────┐  ┌──────────────────┐                            │
│  │  Agent  │  │    Hooks      │  │   Plugin (40     │                            │
│  │ Runtime │  │ classify,draft│  │   tools via API) │                            │
│  │         │  │ briefing,alert│  │                  │                            │
│  └─────────┘  └──────────────┘  └──────────────────┘                            │
│                             │                                                    │
├─────────────────────────────┼────────────────────────────────────────────────────┤
│                      Data Stores                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                                      │
│  │PostgreSQL│  │  Redis   │  │  IMAP    │                                      │
│  │ (Prisma) │  │ (queues) │  │  (GMX)   │                                      │
│  └──────────┘  └──────────┘  └──────────┘                                      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| **Email Poll Worker** | IMAP fetch, parse, dedupe, thread, store message + conversation | BullMQ queue, Prisma, enqueues classify job |
| **Classify Worker** (NEW) | Run OpenClaw agent session to classify email, match guest, extract info | BullMQ queue, Gateway WS, Prisma (writes classification results) |
| **Draft Generator** (REWORKED) | Run OpenClaw agent session with full tool access to generate reply draft | BullMQ queue, Gateway WS, Prisma (writes AiDraft record) |
| **Gateway WS Client** | Persistent WebSocket to OpenClaw, RPC request/response, chat event routing | OpenClaw Gateway, used by Classify Worker and Draft Generator |
| **OpenClaw Plugin** | 40 tools (search_guests, update_conversation, etc.) calling Fastify REST API | Fastify REST API via HTTP, used by OpenClaw agent during sessions |
| **Inbox Routes** | REST endpoints for conversation listing, draft actions, reply sending | Prisma, BullMQ (enqueue draft jobs), Email module (SMTP send) |
| **Frontend Inbox** | Three-tab UI, conversation thread, guest-match banners, draft review | Fastify REST API via React Query polling |
| **OTA Parsers** | Extract structured booking data from OTA email HTML | Called by Email Poll Worker, results stored on conversation |

## Data Flow

### Flow 1: Email Arrival Through Classification (NEW)

```
[IMAP Inbox]
    │ email-poll BullMQ job (every 2 min)
    ↓
[Email Poll Worker]
    │ 1. IMAP fetch (UID-based incremental)
    │ 2. Parse MIME (mailparser)
    │ 3. Deduplicate by Message-ID
    │ 4. Thread (find/create conversation)
    │ 5. Store message + attachments
    │ 6. Run OTA parser (if applicable)
    │ 7. Enqueue ai-classify job  ← CHANGED: was inline classifyEmail()
    ↓
[ai-classify BullMQ Queue]
    │
    ↓
[Classify Worker]  ← NEW COMPONENT
    │ 1. gateway.request('agent', {
    │      message: <email content + metadata>,
    │      agentId: 'main',
    │      sessionKey: 'hook:classify:<conversationId>',
    │      deliver: false,
    │      extraSystemPrompt: <classify skill instructions>
    │    })
    │ 2. Agent uses tools:
    │    - search_guests (find matching guest by email/name)
    │    - get_conversation (read thread context)
    │    - update_conversation (set classification)
    │ 3. Accumulate chat events → parse structured response
    │ 4. Write classification result to conversation + message
    │ 5. Write guest match (or null) to conversation.guestId
    ↓
[Database Updated]
    │ conversation.classification = 'guest_inquiry' | 'ota_notification' | ...
    │ conversation.guestId = <matched guest or null>
    │ message.classification = <same>
    │ conversation.classifiedAt = <timestamp>  (new field)
    ↓
[Frontend Polling Picks Up Changes]
```

### Flow 2: Manual Draft Generation (REWORKED)

```
[Ines clicks "Generate Draft" in inbox UI]
    │ POST /api/v1/conversations/:id/drafts/generate
    ↓
[Inbox Route Handler]
    │ 1. Find latest inbound message
    │ 2. Enqueue ai-draft job
    ↓
[ai-draft BullMQ Queue]
    │
    ↓
[Draft Generator]  ← REWORKED: full agent session, not prompt-building
    │ 1. gateway.request('agent', {
    │      message: <latest inbound message content>,
    │      agentId: 'main',
    │      sessionKey: 'hook:draft:<conversationId>:<timestamp>',
    │      deliver: false,
    │      extraSystemPrompt: <draft skill + business context>
    │    })
    │ 2. Agent uses tools during drafting:
    │    - get_conversation (full thread)
    │    - search_guests (guest context)
    │    - check_availability (room data)
    │    - list_events (upcoming events)
    │ 3. Accumulate chat events → extract final content
    │ 4. Calculate cost, write AiDraft record
    ↓
[AiDraft record in DB]
    │ status: 'pending'
    ↓
[Frontend polls → shows draft card → Ines reviews]
```

### Flow 3: Classification Results to Frontend

```
[Classify Worker completes]
    │ Writes to DB: conversation.classification, conversation.guestId
    ↓
[Frontend React Query Polling]
    │ GET /api/v1/conversations?status=open  (every 10-30s)
    │ Each conversation now has:
    │   - classification: 'guest_inquiry' | 'ota_notification' | 'other'
    │   - guest: { id, name, email } | null
    │   - classifiedAt: timestamp | null (pending if null)
    ↓
[Three-Tab Rendering]
    │ Tab assignment based on conversation.classification:
    │   - 'guest_inquiry' → Conversations tab
    │   - 'ota_notification' → OTA tab
    │   - everything else → Other tab
    │   - null (not yet classified) → show spinner in current tab
    ↓
[Guest-Match Banner]
    │ If conversation.guestId is null AND classification is 'guest_inquiry':
    │   Show banner: "No matching guest found — Create [Name] [Email]?"
    │ If conversation.guestId is set:
    │   Show linked guest name (clickable to guest profile)
```

## Key Architectural Patterns

### Pattern 1: Agent Session via Gateway RPC

**What:** All AI operations (classify, draft, chat) use the same gateway.request('agent', ...) pattern with chat event accumulation.

**When to use:** Any operation requiring LLM reasoning with tool access.

**Trade-offs:**
- Pro: Consistent pattern, all AI calls go through OpenClaw (model failover, tool access, session management handled by gateway)
- Pro: Classification agent can use the same 40 tools as Koda
- Con: 5-30 second latency per session; must be async (BullMQ)
- Con: Gateway must be running; need graceful degradation

**Current implementation (draft-generator.ts, lines 106-181):**
```typescript
// Pre-check gateway connectivity
if (!gateway.isConnected) {
  throw new Error('Gateway WebSocket not connected');
}

const draftSessionKey = `draft:${conversationId}:${Date.now()}`;

// Accumulate response via chat events
const result = await new Promise<{ content: string; usage; model }>((resolve, reject) => {
  let content = '';
  const unsub = gateway.onChatEvent((evt) => {
    if (evt.sessionKey !== draftSessionKey) return;
    if (evt.state === 'delta') content += evt.message?.content ?? '';
    if (evt.state === 'final') { unsub(); resolve({ content, usage: evt.usage, model: evt.model }); }
    if (evt.state === 'error') { unsub(); reject(new Error(evt.errorMessage)); }
  });

  gateway.request('agent', {
    message: lastUserMessage,
    agentId: 'main',
    sessionKey: draftSessionKey,
    deliver: false,
    idempotencyKey: crypto.randomUUID(),
    extraSystemPrompt: systemPrompt,
  }).catch(reject);
});
```

**Classification will use the same pattern** with a different sessionKey prefix and extraSystemPrompt containing classification instructions.

### Pattern 2: BullMQ Job Chain (email-poll → classify → optional draft)

**What:** Email processing as a chain of BullMQ jobs rather than a single monolithic pipeline.

**When to use:** When pipeline steps have different latency profiles and failure modes.

**Trade-offs:**
- Pro: Email polling is fast (IMAP + parse + store), classification is slow (agent session); decoupling prevents classification latency from blocking polling
- Pro: Classification failures don't lose the email (already stored)
- Pro: Each step can retry independently
- Con: More complex than inline processing; need to track job chain state
- Con: Gap between message storage and classification visible in UI (classification: null)

**Implementation approach:**
```
email-poll worker:
  → store message and conversation (fast, ~200ms)
  → enqueue ai-classify job with { conversationId, messageId }
  → DO NOT call classifyEmail() or matchOrCreateGuest() inline

ai-classify worker:
  → run OpenClaw agent session
  → agent calls search_guests, update_conversation tools
  → write classification + guest match to DB
  → NO auto-draft enqueue (Ines triggers manually)
```

### Pattern 3: OpenClaw Hook Configuration for Classify

**What:** Add a `classify` hook mapping in openclaw.json to configure how the classify agent session behaves.

**When to use:** When adding a new type of agent session that should be isolated from chat/draft sessions.

**Implementation:**
```json
{
  "hooks": {
    "mappings": [
      {
        "match": { "path": "classify" },
        "action": "agent",
        "agentId": "main",
        "sessionKey": "hook:classify:{{message}}",
        "deliver": false
      }
    ]
  }
}
```

**Important:** The `deliver: false` flag prevents classification results from being sent to WhatsApp. The `sessionKey` template with `{{message}}` ensures each classification gets its own isolated session (no cross-contamination between concurrent classifications).

**Note on hook vs direct gateway.request:** The hook configuration in openclaw.json defines behavior for HTTP-triggered hooks (POST /hooks/classify). The backend uses gateway.request('agent', ...) directly via WebSocket, which mirrors the hook behavior but with more control. The openclaw.json mapping serves as documentation and as the fallback if we ever need HTTP-triggered classification. The backend should replicate the hook params (deliver: false, isolated sessionKey) in its gateway.request() call.

### Pattern 4: Structured Agent Response Parsing

**What:** The classify agent must return structured data (classification category, confidence, guest match, extracted info) that the backend can parse programmatically.

**When to use:** When agent output needs to be consumed by code, not just displayed to a user.

**Trade-offs:**
- Pro: Full LLM reasoning produces better classification than regex
- Con: LLM output can be unpredictable; need robust parsing with fallbacks
- Con: Token cost per email (~500-2000 tokens in, ~200-500 tokens out)

**Implementation approach:**
```
extraSystemPrompt for classify:
  - "Classify this email into one of: guest_inquiry, ota_notification, spam_newsletter, admin_system, other"
  - "Search for matching guests using search_guests tool"
  - "Call update_conversation to set classification and link guest"
  - "Respond with a JSON block containing: { classification, confidence, guestMatch, language, extractedInfo }"

Backend parsing:
  - Accumulate chat events (same as draft)
  - Parse final content as JSON
  - If JSON parsing fails, extract fields via regex fallback
  - If all parsing fails, set classification to null (manual classification required)
```

**Alternative (RECOMMENDED): Tool-based classification output.**
Instead of parsing the agent's text response, add a new `classify_email` tool to the OpenClaw plugin that the agent calls with the structured result. The tool writes directly to the DB. This eliminates response parsing entirely.

```typescript
// In openclaw-plugin/tools/conversations.ts
api.registerTool({
  name: 'classify_email',
  label: 'Classify Email',
  description: 'Set the classification and guest match for an email conversation.',
  parameters: {
    type: 'object',
    properties: {
      conversationId: { type: 'string' },
      classification: { type: 'string', enum: ['guest_inquiry', 'ota_notification', 'spam_newsletter', 'admin_system', 'other'] },
      confidence: { type: 'number' },
      guestId: { type: 'string', description: 'Matched guest ID (from search_guests), or null' },
      language: { type: 'string', enum: ['en', 'de'] },
      extractedName: { type: 'string' },
      extractedEmail: { type: 'string' },
    },
    required: ['conversationId', 'classification', 'confidence'],
  },
  async execute(_id, params) {
    // Calls PATCH /api/v1/conversations/:id with classification data
    // Also sets guestId if provided
  },
});
```

This pattern is strongly preferred because:
1. The agent calls the tool as its action (no brittle text parsing)
2. The tool validates the schema (Zod on the API side)
3. The DB write happens inside the agent session (atomic)
4. The backend worker just needs to detect session completion (final event), not parse content

## Component Boundaries

### What Talks to What

| Source | Target | Protocol | Direction | Notes |
|--------|--------|----------|-----------|-------|
| Email Poll Worker | IMAP Server | IMAP/TLS | pull | Connect-per-poll, UID incremental |
| Email Poll Worker | Prisma/PostgreSQL | SQL | write | Store message, conversation, attachments |
| Email Poll Worker | BullMQ/Redis | job enqueue | write | Enqueue ai-classify job |
| Classify Worker | Gateway WS Client | method call | bidirectional | gateway.request + onChatEvent |
| Gateway WS Client | OpenClaw Gateway | WebSocket RPC v3 | bidirectional | Persistent connection, auto-reconnect |
| OpenClaw Agent | Plugin Tools | function call | request/response | Agent calls tools during session |
| Plugin Tools | Fastify REST API | HTTP | request/response | Tools call backend API with API key auth |
| Draft Worker | Gateway WS Client | method call | bidirectional | Same pattern as classify |
| Inbox Routes | Prisma/PostgreSQL | SQL | read/write | List/get conversations, draft actions |
| Inbox Routes | BullMQ/Redis | job enqueue | write | Manual draft generation |
| Frontend | Inbox Routes | HTTP REST | polling | React Query, 10-30s interval |
| Notification Service | Gateway WS Client | method call | write | Alerts and briefings (deliver=true) |

### Boundary Rules

1. **Email Poll Worker MUST NOT call the gateway directly.** It stores the email and enqueues a classify job. This keeps polling fast and isolated from AI latency.

2. **Classify Worker MUST NOT create guests.** It matches existing guests via tools and writes the match to the conversation. Guest creation is a UI action (banner click).

3. **Draft Worker MUST NOT auto-trigger.** Only manual trigger via POST /conversations/:id/drafts/generate.

4. **OpenClaw Plugin Tools MUST NOT write to DB directly.** They call the Fastify REST API, which enforces business rules, validation, and audit logging.

5. **Frontend MUST NOT call the gateway.** All AI interactions go through REST endpoints that enqueue jobs.

## Recommended Project Structure Changes

```
packages/backend/src/
├── services/
│   ├── email/
│   │   ├── index.ts              # REWRITE: remove classifier/matcher calls, add classify job enqueue
│   │   ├── imap.service.ts       # KEEP: no changes
│   │   ├── smtp.service.ts       # KEEP: no changes
│   │   ├── email-parser.ts       # KEEP: no changes
│   │   ├── email-threader.ts     # KEEP or RESEARCH: threading approach
│   │   ├── email-classifier.ts   # REMOVE: replaced by OpenClaw classify
│   │   ├── contact-matcher.ts    # REMOVE: replaced by OpenClaw guest matching
│   │   ├── language-detector.ts  # EVALUATE: OpenClaw may handle this
│   │   └── ota-parsers/          # KEEP: parse but don't auto-create
│   ├── ai/
│   │   ├── draft-generator.ts    # REWORK: full agent session (mostly exists, refine)
│   │   ├── classify-session.ts   # NEW: OpenClaw classify agent session runner
│   │   ├── context-builder.ts    # KEEP: used by draft skill
│   │   ├── classifier.ts         # KEEP: edge-case flags (supplement, not replace)
│   │   ├── cost-calculator.ts    # KEEP: shared by classify + draft
│   │   └── prompts/
│   │       ├── system.ts         # KEEP: draft system prompt
│   │       └── classification.ts # REWORK: classify skill instructions
│   ├── gateway/
│   │   ├── gateway-ws-client.ts  # KEEP: no changes needed
│   │   └── types.ts              # KEEP: may add ClassifyResult type
│   └── queue/
│       ├── queue.ts              # ADD: ai-classify queue registration
│       ├── worker.ts             # ADD: classify worker registration
│       └── jobs/
│           ├── email-poll.job.ts  # KEEP: no changes
│           ├── ai-classify.job.ts # NEW: classify job processor
│           └── ai-draft.job.ts    # SIMPLIFY: remove auto-trigger, keep manual
├── modules/
│   └── inbox/
│       ├── inbox.routes.ts       # ADD: classify status endpoint, guest-match endpoint
│       ├── inbox.schema.ts       # ADD: classify/guest-match schemas
│       └── conversation.service.ts # ADD: linkGuest, getClassificationStatus

packages/assistant/openclaw-plugin/
├── tools/
│   ├── conversations.ts          # ADD: classify_email tool
│   └── ...                       # KEEP: all existing tools

openclaw/
├── openclaw.json                 # ADD: classify hook mapping
└── workspace/skills/
    └── classify/
        └── SKILL.md              # NEW: classification skill instructions
```

### Structure Rationale

- **classify-session.ts** alongside draft-generator.ts: Same architectural pattern (gateway agent session), shared helpers (cost calculator, chat event accumulation). Having them side-by-side makes the pattern reusable.
- **ai-classify queue separate from ai-draft**: Different retry strategies, different concurrency needs. Classification should be faster (fewer tokens) with more retries. Draft generation is heavier but less urgent (manually triggered).
- **classify_email tool in plugin**: The agent's output becomes a tool call, not parsed text. The tool calls the REST API, which writes to DB with proper validation and audit logging.

## Schema Changes Required

### Conversation Model Additions

```prisma
model Conversation {
  // ... existing fields ...
  classifiedAt     DateTime?  @map("classified_at") @db.Timestamptz(3)  // when AI classification completed
  classifyJobId    String?    @map("classify_job_id")                    // BullMQ job ID for tracking
  guestMatchSource String?    @map("guest_match_source")                // 'ai' | 'manual' | 'email-pipeline'
  otaParsedData    Json?      @map("ota_parsed_data")                   // extracted OTA booking data (display only)
}
```

### New Queue Definition

```typescript
// In packages/shared/src/types/jobs.ts
export const QUEUE_NAMES = {
  // ... existing ...
  AI_CLASSIFY: 'ai-classify',  // NEW
} as const;

export interface AiClassifyJobData {
  conversationId: string;
  messageId: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  textPreview: string;  // First 2000 chars of email body
  hasOtaData: boolean;  // Whether OTA parser found structured data
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Parsing Agent Text Response for Structured Data

**What people do:** Ask the agent to "respond with JSON" and parse the text response.
**Why it's wrong:** LLM output formatting is unreliable. Even with strict instructions, the agent may wrap JSON in markdown, add explanation text, or produce malformed JSON.
**Do this instead:** Register a `classify_email` tool that the agent calls with the structured result. The tool enforces the schema via its parameter definition. The backend detects success by the tool call, not by parsing text.

### Anti-Pattern 2: Blocking Email Polling on Classification

**What people do:** Run classification inline during email polling (call gateway.request inside pollInbox loop).
**Why it's wrong:** Agent sessions take 5-30 seconds. During that time, no other emails are polled. A batch of 10 emails would take 50-300 seconds, risking IMAP timeouts and duplicate fetches.
**Do this instead:** Store the email immediately (fast, ~200ms), enqueue a classify job, and move to the next email. Classification happens asynchronously.

### Anti-Pattern 3: Auto-Creating Guests from Classification

**What people do:** Have the classify agent call `prepare_create_guest` when no match is found.
**Why it's wrong:** The whole point of this rework is to stop auto-creating guests. The classify agent should only search and match, never create. Guest creation is an explicit UI action by Ines.
**Do this instead:** Classify agent calls `search_guests`, and if no match is found, returns extracted sender info (name, email) in the classification result. The frontend shows a "Create guest?" banner with pre-filled data.

### Anti-Pattern 4: Sharing Session Keys Between Concurrent Classifications

**What people do:** Use a fixed sessionKey like `hook:classify` for all classification sessions.
**Why it's wrong:** If two emails arrive in the same poll batch, their classify jobs may run concurrently. A shared sessionKey means their chat events get mixed, and the agent's context is contaminated.
**Do this instead:** Use `hook:classify:<conversationId>` as the sessionKey. Each classification gets its own isolated session.

### Anti-Pattern 5: Re-classifying Already Classified Conversations

**What people do:** Enqueue a classify job for every inbound message, even replies in existing conversations.
**Why it's wrong:** Reply messages in an already-classified conversation don't need reclassification. Wastes tokens and gateway bandwidth.
**Do this instead:** Only enqueue classify jobs for messages that create new conversations OR messages in conversations where `classifiedAt` is null. Thread-continuation messages inherit the conversation's existing classification.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| OpenClaw Gateway | Persistent WebSocket, RPC v3 protocol | Single connection shared by classify, draft, chat, notifications. Client handles reconnection. |
| IMAP (GMX) | Connect-per-poll via imapflow | Polling frequency configurable (default 2 min). UID-based incremental fetch. |
| SMTP (GMX) | On-demand via nodemailer | Only used when sending (reply, approve draft). Threading headers maintained. |
| PostgreSQL | Prisma ORM | All state stored here. Classification, guest matches, drafts, messages. |
| Redis | BullMQ queues | Job queues for email-poll, ai-classify, ai-draft, calendar-sync, scheduled. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Email Poll Worker ↔ Classify Worker | BullMQ job (async) | Decoupled by queue. Poll stores message, enqueues classify. |
| Classify Worker ↔ OpenClaw Agent | Gateway WS RPC → chat events | Agent runs tools → tools call REST API → DB updated |
| OpenClaw Plugin ↔ Fastify API | HTTP REST (API key auth) | Plugin tools are HTTP clients; Fastify enforces validation/auth |
| Frontend ↔ Classify Results | REST polling (React Query) | No WebSocket to frontend; polling interval sufficient for this use case |
| Classify Worker ↔ Draft Worker | NO direct communication | Independent. Classify sets classification. Draft triggered manually by Ines. |

## Build Order (Dependencies)

The components have clear dependencies that constrain build order:

### Phase A: Foundation (must come first)

1. **Schema migration** -- Add `classifiedAt`, `classifyJobId`, `guestMatchSource`, `otaParsedData` to Conversation model. Add `AI_CLASSIFY` to QUEUE_NAMES.
2. **classify_email plugin tool** -- Register new tool in openclaw-plugin that calls PATCH /api/v1/conversations/:id with classification data. Extend the existing update_conversation endpoint to accept classifiedAt, guestId, guestMatchSource, otaParsedData.
3. **Classify skill** -- Write `openclaw/workspace/skills/classify/SKILL.md` with classification instructions, categories, and tool usage guidance.
4. **Hook mapping** -- Add classify hook to openclaw.json.

### Phase B: Backend Pipeline (depends on A)

5. **ai-classify queue + worker** -- Register queue in queue.ts, create classify job processor (classify-session.ts + ai-classify.job.ts), register worker in worker.ts.
6. **Email pipeline rework** -- Remove classifyEmail() and matchOrCreateGuest() calls from email/index.ts. Remove OTA auto-create block. Instead: store message, run OTA parser (store parsed data on conversation but don't auto-create), enqueue ai-classify job.
7. **Draft generator rework** -- Convert to full agent session if not already (current implementation already uses gateway.request; may just need to remove the inline context-building and let the agent use tools instead).

### Phase C: API + Frontend (depends on B)

8. **Inbox route updates** -- Add classification status to conversation list response. Add guest-link endpoint (POST /conversations/:id/link-guest). Update list query to support tab filtering by classification.
9. **Three-tab inbox UI** -- Rework inbox-page.tsx with Conversations/OTA/Other tabs. Filter by classification field.
10. **Guest-match banner** -- Show inline banner on unmatched conversations with "Create [Name] [Email]?" button.
11. **OTA tab display** -- Show parsed OTA data (from otaParsedData JSON) in OTA tab conversations.
12. **Draft generation UI** -- Ensure manual "Generate Draft" button works end-to-end.

### Phase D: Cleanup + Testing (depends on C)

13. **Remove dead code** -- Delete email-classifier.ts, contact-matcher.ts. Remove auto-draft enqueue from email pipeline.
14. **Integration tests** -- Test full pipeline: email arrives → stored → classified → guest matched → draft generated on demand.
15. **Gateway-down fallback** -- Test and handle: what happens when gateway is unavailable? Emails should still be stored with classification: null. Classify jobs retry. UI shows "pending classification" state.

### Build Order Rationale

- **A before B:** The classify worker needs the plugin tool and skill to exist before it can run agent sessions.
- **B before C:** The backend pipeline must produce classification data before the frontend can display tabs and banners.
- **A.1 (schema) first:** Everything else depends on the new DB fields.
- **D after C:** Cleanup and testing only make sense once the new pipeline is complete.
- **Items within each phase can be parallelized** where noted (e.g., A.2 and A.3 are independent).

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (1 user, ~20 emails/day) | Single classify worker (concurrency 1). Poll every 2 min. React Query polling every 15s. Sufficient. |
| 100 emails/day | Increase classify worker concurrency to 2-3. Consider batching classify jobs (group emails from same poll batch). |
| 1000+ emails/day | Would need: rate limiting on gateway sessions, classify result caching for repeat senders, possibly a lightweight pre-classifier (regex) to skip obvious spam before agent session. Not relevant for MVP. |

### First Bottleneck: Gateway Session Throughput

If email volume increases, the gateway becomes the bottleneck -- each classify session takes 5-30 seconds, and the gateway processes sessions sequentially per agent. Mitigation: fast-path classification for obvious categories (OTA domain match, known spam patterns) before reaching the agent. Only ambiguous emails go through the full agent session.

### Second Bottleneck: Token Cost

Every email triggers a classify session (~700-1500 tokens). At 20 emails/day, cost is negligible (~$0.10/day). At 100+ emails/day, consider: skip classification for reply messages in existing threads, cache classification for known senders (return-visitor pattern), use a cheaper model for classification (the classify hook can specify a lighter model via OpenClaw agent config).

## Sources

- Direct codebase analysis of all files listed in `<files_to_read>` block
- OpenClaw plugin SDK patterns from `packages/assistant/openclaw-plugin/`
- Gateway RPC protocol from `packages/backend/src/services/gateway/types.ts`
- BullMQ job patterns from `packages/backend/src/services/queue/`
- Current email pipeline from `packages/backend/src/services/email/index.ts`
- Current draft generator from `packages/backend/src/services/ai/draft-generator.ts`
- OpenClaw hook config from `openclaw/openclaw.json`

---
*Architecture research for: PYR Inbox & AI Pipeline Rework*
*Researched: 2026-03-01*
