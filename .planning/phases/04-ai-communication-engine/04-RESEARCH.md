# Phase 4: AI Communication Engine - Research

**Researched:** 2026-02-20
**Domain:** LLM integration (Anthropic Claude + OpenAI), prompt engineering, message classification, cost tracking
**Confidence:** HIGH

## Summary

Phase 4 implements the AI communication engine within the existing Fastify backend. The CONTEXT.md specifies that OpenClaw will be the runtime for the assistant (Phases 7-8), but the core AI abstraction layer, context injection, message classification, and draft generation all live in the backend's `services/ai/` module. This phase fills in the stub files that already exist (`ai-engine.ts`, `context-builder.ts`, `draft-generator.ts`, `providers/anthropic.ts`, `providers/openai.ts`) and implements the `AiModuleContract` that's already defined in `@pyr/shared`.

The existing codebase has excellent scaffolding: the BullMQ `ai-draft` queue is registered with 3 retries and exponential backoff, the job processor stub exists at `services/queue/jobs/ai-draft.job.ts`, the `AiDraftJobData` type is defined, and the email pipeline already classifies emails and stores messages. What's missing is the actual LLM provider adapters, the context assembly logic, the edge-case classifier, and the cost tracking infrastructure.

The Anthropic SDK (v0.77.0) now supports prompt caching as a GA feature (no beta prefix needed). The `cache_control` field can be set at the top level of `messages.create()` for automatic caching, or on individual content blocks for explicit control. Cache hits cost 10% of base input tokens -- a significant saving for the PYR system prompt which will be largely identical across calls. The minimum cacheable threshold for Claude Sonnet 4.5 is 1024 tokens, and the system prompt + brand voice + business rules will comfortably exceed this.

**Primary recommendation:** Implement the provider abstraction as a simple interface with `generateMessage()` and `healthCheck()` methods. Use the existing `@anthropic-ai/sdk` (bump to ^0.77.0) and `openai` (already at ^4.78.1) packages. Apply automatic prompt caching via top-level `cache_control`. Build the context builder to aggregate guest, conversation, availability, pricing, and event data into a structured system prompt. Classify messages with keyword/pattern matching enhanced by LLM classification for ambiguous cases.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Brand Voice & Persona:**
- Persona is configured via chat-based conversation only -- Ines talks to OpenClaw to set up its identity and communication style (via SOUL.md + memory)
- No dashboard UI needed for persona settings -- chat is the interface
- Auto-detect language (EN/DE) from every incoming message and reply in the same language -- no fallback to guest profile needed
- Strict guardrails in all guest communications:
  - No pricing commitments without checking availability
  - No medical or dietary advice
  - No promises about specific puppies being present
  - Never discuss competitor retreats
  - Never share personal info about other guests
  - Never make guarantees about weather or experience quality

**Skill Design & Data Access:**
- Build a dedicated agent API (`/api/v1/agent/*`) with endpoints optimized for AI consumption -- pre-aggregated data, richer context per call, fewer round-trips
- Full business data access: guests, bookings, rooms, availability, events, revenue, conversations, settings -- everything the dashboard shows
- ALL write operations require Ines's confirmation -- no exceptions, no auto-execute, no tiered risk levels
- One skill per domain -- separate SKILL.md files (guests, bookings, events, availability, etc.) so only relevant skills are loaded per turn, keeping token overhead low

**Draft Generation Pattern:**
- BullMQ job triggers draft generation -- email pipeline queues a "generate-draft" job, a worker calls OpenClaw/agent API to produce the draft. Gives us retry control and failure handling.
- Rich context injection per draft call: guest CRM profile + full conversation history + current room availability + pricing + upcoming events + guest's past bookings
- Edge cases (complaints, medical/dietary requests, cancellations, adoption inquiries) still get AI drafts but marked as "sensitive -- review carefully" -- Ines can use as starting point or discard
- Only guest inquiry emails get AI drafts -- OTA notifications, spam/newsletter, and admin/system emails are NOT sent to the AI

### Claude's Discretion
- Cost tracking implementation (user chose to skip discussion -- build what makes sense)
- Exact OpenClaw Gateway configuration (ports, models, token limits, session settings)
- Prompt caching strategy with Anthropic provider
- SOUL.md initial template structure (Ines will refine via chat)
- Message classification implementation approach (edge case detection)
- Agent API endpoint design (request/response shapes, aggregation strategy)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AI-01 | System prompt includes business context injection: guest CRM data, conversation history, current availability, pricing, upcoming events, brand voice guidelines | Context builder pattern in Architecture Patterns section; agent API endpoints aggregate all needed data; system prompt template with variable injection |
| AI-02 | LLM integration supports Claude API (primary) and OpenAI (fallback) with model-agnostic abstraction layer | Provider interface pattern in Standard Stack section; Anthropic SDK v0.77.0 and OpenAI SDK v4.78+ both support messages/chat completions API; fallback logic in ai-engine.ts |
| AI-03 | Every AI call logs token usage and estimated cost | Both SDKs return `usage` object with input/output token counts; cost calculation from pricing table; DB schema needs migration to store input/output tokens separately and costEur |
| AI-05 | System classifies incoming messages for edge cases (complaints, medical/dietary, cancellations, adoption inquiries) and flags for priority manual handling | Pattern-based classification with keyword detection; LLM fallback for ambiguous cases; flags stored on message and conversation records |
| AI-06 | System prompt prefix is cached (Anthropic prompt caching) for cost optimization | Anthropic prompt caching is GA; automatic caching via top-level `cache_control`; 1024-token minimum for Sonnet models; 5-minute TTL with refresh; 90% cost reduction on cache hits |
| ARCH-03 | AI engine exposes a simple interface (generateDraft, classifyMessage) that email and assistant modules consume independently | `AiModuleContract` already defined in `@pyr/shared` with `generateDraft`, `classifyMessage`, `healthCheck`; cross-module communication via BullMQ queues |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | ^0.77.0 | Primary LLM provider (Claude API) | Official Anthropic SDK; prompt caching GA; typed responses with usage data |
| `openai` | ^4.78.1 | Fallback LLM provider (OpenAI API) | Official OpenAI SDK; already installed; compatible chat completions API |
| `franc-min` | ^6.2.0 | Language detection (EN/DE) | Already in use in `language-detector.ts`; trigram-based, no external API calls |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^3.24.1 | Validate AI response structures and API schemas | Already used everywhere; validate LLM output parsing |
| `bullmq` | ^5.34.8 | Queue for async draft generation jobs | Already registered; `ai-draft` queue exists with retry config |
| `prisma` | ^6.2.1 | Store drafts, cost logs, classification results | Already used; may need schema migration for token tracking |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct SDK usage | Vercel AI SDK (`ai`) | Adds abstraction layer overhead; PYR only needs two providers with simple fallback; direct SDK gives more control over prompt caching |
| `franc-min` for language detection | LLM-based detection | Adds latency and cost per message; franc-min is fast and sufficient for EN/DE binary choice |
| Custom prompt templates | LangChain / LangSmith | Massive dependency for simple template interpolation; PYR has <10 prompt templates |

**Installation:**
```bash
cd packages/backend
pnpm add @anthropic-ai/sdk@^0.77.0
# openai already at ^4.78.1, franc-min at ^6.2.0 -- no changes needed
```

Note: The `@anthropic-ai/sdk` is already listed in `package.json` at `^0.39.0`. This needs a bump to `^0.77.0` to get GA prompt caching support (the `cache_control` top-level field was added in later versions). The STATE.md explicitly calls this out as a known blocker.

## Architecture Patterns

### Recommended Project Structure
```
packages/backend/src/
├── services/ai/
│   ├── index.ts              # createAiModule() factory -- implements AiModuleContract
│   ├── ai-engine.ts          # Provider orchestration: try primary, fallback on error
│   ├── providers/
│   │   ├── types.ts           # LlmProvider interface + LlmResponse type
│   │   ├── anthropic.ts       # Claude adapter with prompt caching
│   │   └── openai.ts          # OpenAI adapter (fallback)
│   ├── context-builder.ts     # Assembles system prompt from business data
│   ├── draft-generator.ts     # Orchestrates context + LLM call + DB write
│   ├── classifier.ts          # Message edge-case classification
│   ├── cost-calculator.ts     # Token -> EUR cost calculation
│   └── prompts/
│       ├── system.ts          # System prompt template (brand voice, rules, guardrails)
│       └── classification.ts  # Classification prompt template
├── services/queue/jobs/
│   └── ai-draft.job.ts        # BullMQ job processor (already exists as stub)
└── modules/agent/             # Agent API endpoints for OpenClaw (Phase 7-8 prep)
    ├── agent.routes.ts        # /api/v1/agent/* endpoints
    ├── agent.service.ts       # Pre-aggregated data queries
    └── agent.schema.ts        # Zod schemas for agent API
```

### Pattern 1: Provider Interface (Model-Agnostic Abstraction)
**What:** A common interface that both Anthropic and OpenAI adapters implement, allowing transparent provider switching.
**When to use:** Every LLM call goes through this interface.
**Example:**
```typescript
// services/ai/providers/types.ts
export interface LlmProvider {
  name: string;
  generateMessage(params: LlmRequest): Promise<LlmResponse>;
  healthCheck(): Promise<boolean>;
}

export interface LlmRequest {
  systemPrompt: string | ContentBlock[];
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  cacheControl?: boolean;  // Enable prompt caching (Anthropic only)
}

export interface LlmResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  };
  provider: string;
  durationMs: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
```

### Pattern 2: Primary/Fallback Engine
**What:** The AI engine tries the primary provider (Claude), and on failure falls back to OpenAI transparently.
**When to use:** Every AI call routes through the engine.
**Example:**
```typescript
// services/ai/ai-engine.ts
export function createAiEngine(
  primary: LlmProvider,
  fallback: LlmProvider,
  logger: Logger,
): AiEngine {
  return {
    async generate(params: LlmRequest): Promise<LlmResponse> {
      try {
        return await primary.generateMessage(params);
      } catch (err) {
        logger.warn({ err, provider: primary.name }, 'Primary LLM failed, trying fallback');
        return await fallback.generateMessage({
          ...params,
          cacheControl: false, // OpenAI doesn't support Anthropic caching
        });
      }
    },
  };
}
```

### Pattern 3: Context Builder (System Prompt Assembly)
**What:** Aggregates business data into a structured system prompt for each draft generation call.
**When to use:** Before every LLM call that generates a guest reply.
**Example:**
```typescript
// services/ai/context-builder.ts
export async function buildDraftContext(
  prisma: PrismaClient,
  conversationId: string,
): Promise<DraftContext> {
  // 1. Load conversation with all messages
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      guest: true,
      messages: { orderBy: { sentAt: 'asc' } },
    },
  });

  // 2. Load guest's booking history
  const bookings = conversation.guestId
    ? await prisma.booking.findMany({
        where: { guestId: conversation.guestId, deletedAt: null },
        include: { room: { include: { roomType: true } } },
        orderBy: { checkIn: 'desc' },
      })
    : [];

  // 3. Load current availability (next 90 days)
  const availability = await getAvailabilitySummary(prisma);

  // 4. Load upcoming events
  const events = await getUpcomingEvents(prisma);

  // 5. Build structured context object
  return { conversation, guest: conversation.guest, bookings, availability, events };
}

export function buildSystemPrompt(context: DraftContext, language: 'en' | 'de'): string {
  // Template with injected business data
  return `${BRAND_VOICE_PREFIX}

## Current Guest
${formatGuestProfile(context.guest)}

## Their Booking History
${formatBookings(context.bookings)}

## Room Availability
${formatAvailability(context.availability)}

## Upcoming Events
${formatEvents(context.events)}

## Conversation History
${formatConversation(context.conversation.messages)}

## Instructions
- Respond in ${language === 'de' ? 'German' : 'English'}
- Sign off as Ines
${GUARDRAILS}`;
}
```

### Pattern 4: Edge-Case Classification
**What:** Pattern-based keyword detection with optional LLM enhancement for ambiguous cases.
**When to use:** On every inbound guest inquiry message, before draft generation.
**Example:**
```typescript
// services/ai/classifier.ts
const EDGE_CASE_PATTERNS: Record<string, RegExp[]> = {
  complaint: [/unhappy/i, /disappointed/i, /terrible/i, /worst/i, /refund/i, /compensation/i,
              /unzufrieden/i, /enttäuscht/i, /schrecklich/i, /Erstattung/i],
  medical: [/allerg/i, /medical/i, /disability/i, /wheelchair/i, /medication/i,
            /Allergie/i, /medizinisch/i, /Rollstuhl/i, /Medikament/i],
  dietary: [/vegan/i, /gluten.free/i, /celiac/i, /lactose/i, /nut.allergy/i,
            /glutenfrei/i, /Laktose/i, /Nussallergie/i],
  cancellation: [/cancel/i, /refund/i, /can't.make.it/i, /change.dates?/i,
                 /stornieren/i, /absagen/i, /umbuchen/i],
  adoption: [/adopt/i, /take.home/i, /keep.the.puppy/i, /rescue/i,
             /adoptieren/i, /mitnehmen/i, /behalten/i],
};

export function classifyEdgeCases(content: string): string[] {
  const flags: string[] = [];
  for (const [flag, patterns] of Object.entries(EDGE_CASE_PATTERNS)) {
    if (patterns.some(p => p.test(content))) {
      flags.push(flag);
    }
  }
  return flags;
}
```

### Pattern 5: Anthropic Prompt Caching
**What:** Use automatic caching via top-level `cache_control` to cache the system prompt prefix.
**When to use:** Every Claude API call.
**Example:**
```typescript
// services/ai/providers/anthropic.ts
// Source: https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

const response = await client.messages.create({
  model: config.AI_DEFAULT_MODEL,  // claude-sonnet-4-5-20250929
  max_tokens: 2048,
  temperature: 0.5,
  cache_control: { type: 'ephemeral' },  // Automatic caching -- GA, no beta needed
  system: [
    {
      type: 'text',
      text: systemPromptPrefix,  // Brand voice, guardrails, business rules (~2000 tokens)
      cache_control: { type: 'ephemeral' },  // Explicit breakpoint on stable content
    },
    {
      type: 'text',
      text: dynamicContext,  // Guest data, availability, conversation -- changes per call
    },
  ],
  messages: conversationMessages,
});

// Usage includes cache tracking
const { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens } = response.usage;
```

### Anti-Patterns to Avoid
- **Importing Prisma in providers:** Providers should receive data, not query it. Context builder handles all DB access.
- **Synchronous draft generation in request handler:** Always use BullMQ async job. Never block the email poll worker waiting for LLM response.
- **Hardcoding model names:** Use `app.config.AI_DEFAULT_MODEL` from env. The model may change (e.g., from Sonnet 4.5 to a newer model).
- **Storing raw LLM responses:** Only store the generated draft text, model name, and token counts. Raw API responses contain unnecessary data.
- **Cross-importing between email and AI modules:** Use BullMQ job enqueue, never direct function imports between `services/email/` and `services/ai/`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting | Manual string-to-token estimation | SDK response `usage` fields | Both Anthropic and OpenAI return exact token counts in the response; estimation is unreliable |
| Language detection | LLM-based language classifier | `franc-min` (already installed) | Sub-millisecond, no API cost, accurate for EN/DE binary choice |
| Prompt template engine | Custom template string interpolation | Simple string concatenation with helper functions | PYR has <10 templates; a template engine adds unnecessary complexity |
| Retry logic with exponential backoff | Custom retry wrapper | BullMQ job retry configuration | Already configured: 3 attempts, exponential backoff from 3s |
| Provider SDK error handling | Custom HTTP client for LLM APIs | Official SDKs (`@anthropic-ai/sdk`, `openai`) | Handle rate limits, timeouts, auth errors, streaming, and retries internally |

**Key insight:** The LLM SDKs handle the hard networking problems (retries, streaming, error types). The BullMQ queue handles job-level retries. What we need to build is the business logic glue: context assembly, prompt templates, and cost tracking.

## Common Pitfalls

### Pitfall 1: Prompt Caching Minimum Token Threshold
**What goes wrong:** System prompt is below 1024 tokens and caching silently does nothing -- no error, just no savings.
**Why it happens:** The brand voice prefix alone might be short. Without injected business context, the system block may not hit the minimum.
**How to avoid:** Structure the system prompt so the static prefix (brand voice + guardrails + business rules + FAQ) is the first block with `cache_control`, and ensure it exceeds 1024 tokens. Monitor `cache_creation_input_tokens` and `cache_read_input_tokens` in responses to verify caching is active.
**Warning signs:** `cache_read_input_tokens` is always 0 in production logs.

### Pitfall 2: OpenAI Fallback Format Mismatch
**What goes wrong:** Anthropic uses `system` as a separate field with content blocks; OpenAI uses `messages` with `role: 'system'`. A provider switch loses prompt structure.
**Why it happens:** The two APIs have fundamentally different message formats.
**How to avoid:** The provider interface normalizes input to a common `LlmRequest` shape. Each adapter maps to its provider's format internally. Test both providers in integration tests.
**Warning signs:** Fallback responses lack context or have formatting issues.

### Pitfall 3: Context Window Overflow
**What goes wrong:** Long conversation history + full business context exceeds the model's context window (200K for Claude, 128K for OpenAI).
**Why it happens:** Guest conversations can grow long, especially with multiple back-and-forth exchanges.
**How to avoid:** Cap conversation history to the last 20 messages. Summarize older messages if needed. Track total prompt size before sending. For PYR's use case (retreat inquiries), conversations rarely exceed 10 messages, so this is LOW risk.
**Warning signs:** API errors with "context length exceeded" or truncated responses.

### Pitfall 4: Anthropic SDK Version Mismatch
**What goes wrong:** The `cache_control` top-level field doesn't exist in older SDK versions. Code compiles but the caching request shape is wrong.
**Why it happens:** The project has `@anthropic-ai/sdk` at `^0.39.0` -- significantly outdated. The STATE.md explicitly flags this.
**How to avoid:** Bump to `^0.77.0` before implementing. Verify the import path: `import Anthropic from '@anthropic-ai/sdk'` (default export).
**Warning signs:** TypeScript errors on `cache_control` field; `beta.promptCaching` is the old API.

### Pitfall 5: Draft Generation Race Condition
**What goes wrong:** Multiple emails from the same guest arrive in quick succession, triggering multiple draft jobs for the same conversation. Results in duplicate drafts.
**Why it happens:** BullMQ processes jobs concurrently by default.
**How to avoid:** Use BullMQ job deduplication by setting `jobId` to `draft-${conversationId}` so only one draft job per conversation is active. Or check for existing pending drafts before generating a new one.
**Warning signs:** Multiple "pending" drafts for the same conversation in the database.

### Pitfall 6: Cost Calculation Drift
**What goes wrong:** Hardcoded pricing becomes wrong when Anthropic or OpenAI change their token prices.
**Why it happens:** LLM pricing changes frequently.
**How to avoid:** Store pricing as a config constant (not in DB -- it changes rarely enough). Include a `lastUpdated` date in the pricing config. Log a warning if pricing hasn't been reviewed in 90 days.
**Warning signs:** Cost estimates diverge from actual API bills.

## Code Examples

Verified patterns from official sources:

### Anthropic Messages API with Prompt Caching (GA)
```typescript
// Source: https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Automatic caching -- simplest approach
const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 2048,
  temperature: 0.5,
  cache_control: { type: 'ephemeral' },  // Auto-cache last cacheable block
  system: 'You are a wellness retreat assistant...',
  messages: [
    { role: 'user', content: 'I would like to book a 4-day retreat in April.' },
  ],
});

// Explicit caching -- for fine-grained control
const responseExplicit = await client.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 2048,
  temperature: 0.5,
  system: [
    {
      type: 'text',
      text: brandVoiceAndGuardrails,  // Static -- cache this
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: dynamicGuestContext,  // Changes per call -- not cached separately
    },
  ],
  messages: conversationHistory,
});

// Response usage tracking
console.log({
  inputTokens: response.usage.input_tokens,
  outputTokens: response.usage.output_tokens,
  cacheRead: response.usage.cache_read_input_tokens,
  cacheWrite: response.usage.cache_creation_input_tokens,
});
```

### OpenAI Chat Completions (Fallback Provider)
```typescript
// Source: https://github.com/openai/openai-node
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await client.chat.completions.create({
  model: 'gpt-4o',  // Fallback model
  max_tokens: 2048,
  temperature: 0.5,
  messages: [
    { role: 'system', content: fullSystemPrompt },
    { role: 'user', content: guestMessage },
  ],
});

// Response usage tracking
console.log({
  inputTokens: response.usage?.prompt_tokens ?? 0,
  outputTokens: response.usage?.completion_tokens ?? 0,
});
```

### BullMQ Job Enqueue for Draft Generation
```typescript
// In email pipeline (services/email/index.ts), after storing a guest inquiry message:
if (classification.category === 'guest_inquiry' && guestId) {
  const aiDraftQueue = app.queues.getQueue(QUEUE_NAMES.AI_DRAFT);
  if (aiDraftQueue) {
    await aiDraftQueue.add('generate-draft', {
      conversationId,
      messageId: message.id,
      guestLanguage: detectLanguage(parsed.text),
    } satisfies AiDraftJobData, {
      jobId: `draft-${conversationId}`,  // Deduplicate per conversation
    });
  }
}
```

### DB Schema Migration for Token Tracking
```prisma
// Migration: add separate input/output token fields and cost tracking to AiDraft
model AiDraft {
  id             String        @id @default(cuid())
  conversationId String        @map("conversation_id")
  messageId      String?       @map("message_id")
  content        String
  status         AiDraftStatus @default(pending)
  model          String
  tokensUsed     Int           @map("tokens_used")     // Keep for backward compat
  inputTokens    Int           @default(0) @map("input_tokens")
  outputTokens   Int           @default(0) @map("output_tokens")
  cacheReadTokens  Int         @default(0) @map("cache_read_tokens")
  cacheWriteTokens Int         @default(0) @map("cache_write_tokens")
  costEur        Int           @default(0) @map("cost_eur")  // cents (microcents for precision)
  provider       String        @default("anthropic")
  durationMs     Int           @default(0) @map("duration_ms")
  flags          String[]      @default([])  // edge case flags: complaint, medical, etc.
  createdAt      DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt      DateTime      @updatedAt @map("updated_at") @db.Timestamptz(3)

  conversation Conversation @relation(fields: [conversationId], references: [id])
  message      Message?     @relation(fields: [messageId], references: [id])

  @@index([conversationId])
  @@index([messageId])
  @@index([status])
  @@map("ai_drafts")
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `client.beta.promptCaching.messages.create()` | `client.messages.create({ cache_control: ... })` | Anthropic SDK ~v0.50+ | Prompt caching is GA; no beta prefix needed |
| Manual block-level cache control only | Top-level `cache_control` for automatic caching | Anthropic SDK ~v0.60+ | Simplifies multi-turn caching; cache breakpoint auto-moves forward |
| `@anthropic-ai/sdk` at 0.39.0 | 0.77.0 latest | 2025-2026 | Many new features, types, and bug fixes; PYR MUST upgrade |
| `openai` SDK v3 | v4 (already installed at ^4.78.1) | 2024 | Typed responses, streaming support, automatic retries |

**Deprecated/outdated:**
- `client.beta.promptCaching` - replaced by GA `cache_control` field on `messages.create()`
- `client.completions.create()` (OpenAI) - use `client.chat.completions.create()` instead
- `betaZodTool` / `toolRunner` APIs mentioned in STATE.md blocker note - not needed for Phase 4 (those are for tool-use in assistant, Phase 7-8)

## Open Questions

1. **Cost precision: cents vs microcents**
   - What we know: Token costs are fractions of a cent per token. For Claude Sonnet 4.5: $3/MTok input, $15/MTok output. A typical draft generation (~2000 input + ~500 output tokens) costs about $0.006 + $0.0075 = ~$0.014 per call.
   - What's unclear: Storing as integer cents would lose precision (1 cent = $0.01, but a call costs $0.014). Storing as microcents (1 microcent = $0.00001) or as integer "tenth-cents" might be better.
   - Recommendation: Store `costEur` in microcents (integer, multiply EUR by 100,000). This gives 5 decimal places of precision, enough for per-call tracking. Display in the dashboard as EUR with 4 decimal places. This is Claude's discretion per CONTEXT.md.

2. **Agent API scope for Phase 4**
   - What we know: CONTEXT.md says to build `/api/v1/agent/*` endpoints. These are consumed by OpenClaw in Phases 7-8.
   - What's unclear: How much of the agent API should be built now vs. deferred?
   - Recommendation: Build the data aggregation service functions now (they're needed for context injection in draft generation anyway), but defer the actual HTTP routes to Phase 7. The context builder calls the same service functions that agent endpoints will later expose. This avoids building routes that have no consumer yet.

3. **AiDraft schema migration scope**
   - What we know: The current `AiDraft` model has only `tokensUsed` (single integer). We need `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `costEur`, `provider`, `durationMs`, `flags`.
   - What's unclear: Whether to keep `tokensUsed` for backward compatibility or replace it.
   - Recommendation: Keep `tokensUsed` as a computed field (= inputTokens + outputTokens) for backward compat with existing frontend code. Add the new fields with defaults so existing records are not affected.

4. **Classification: pattern-only vs pattern+LLM hybrid**
   - What we know: Pattern matching can catch most edge cases. Some messages may be ambiguous.
   - What's unclear: Whether the LLM classification step is worth the added latency and cost.
   - Recommendation: Start with pattern-only classification (zero-cost, instant). It's Phase 4 scope per CONTEXT.md. If pattern matching proves insufficient in UAT, add LLM classification in a later iteration. The classifier interface already supports both approaches.

## Sources

### Primary (HIGH confidence)
- [Anthropic Prompt Caching Documentation](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching) - Full technical details on cache_control, pricing, TTL, minimum tokens, TypeScript examples
- [@anthropic-ai/sdk npm](https://www.npmjs.com/package/@anthropic-ai/sdk) - Version 0.77.0 confirmed as latest
- [OpenAI Node SDK GitHub](https://github.com/openai/openai-node) - v4 API patterns for chat completions
- Existing codebase: `packages/backend/src/services/ai/index.ts` - Stub implementation with `AiModuleContract`
- Existing codebase: `packages/shared/src/types/module-contracts.ts` - `AiModuleContract`, `GenerateDraftParams`, `AiDraftResult`, `MessageClassification` types
- Existing codebase: `packages/shared/src/types/jobs.ts` - `AiDraftJobData` type, `QUEUE_NAMES.AI_DRAFT`
- Existing codebase: `packages/backend/src/services/queue/queue.ts` - AI draft queue registered with 3 retries, exponential backoff from 3s

### Secondary (MEDIUM confidence)
- [Anthropic Pricing](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching#pricing) - Token pricing table for cache writes, reads, and base input
- Project STATE.md - Blocker note about Anthropic SDK version bump (0.39 -> 0.77)

### Tertiary (LOW confidence)
- None -- all findings verified against official docs or existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Both SDKs are official, already partially installed, well-documented
- Architecture: HIGH - Existing codebase has clear patterns (module contracts, queue jobs, service layer); just filling in stubs
- Pitfalls: HIGH - Prompt caching constraints verified against official Anthropic docs; SDK version issue documented in STATE.md
- Cost tracking: MEDIUM - Microcent precision is a recommendation; exact implementation is Claude's discretion per CONTEXT.md

**Research date:** 2026-02-20
**Valid until:** 2026-04-20 (60 days -- stable domain, SDKs update frequently but core patterns are settled)
