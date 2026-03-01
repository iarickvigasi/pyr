# Phase 1: Foundation & Schema - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

All schema, OpenClaw artifacts, and infrastructure are in place so that classification sessions can run and write results to the database. This includes: Prisma migration with new classification fields, the `classify_email` plugin tool, the classify skill (`SKILL.md`), the `AI_CLASSIFY` BullMQ queue, and email threading evaluation/improvement.

</domain>

<decisions>
## Implementation Decisions

### Classification taxonomy
- Keep finer-grained categories (4+ subcategories) that group into 3 inbox tabs (Conversations, OTA, Other)
- Current 4 categories: `guest_inquiry`, `ota_notification`, `spam_newsletter`, `admin_system` — can be extended
- Tabs aggregate categories: e.g., "Other" tab shows spam + system emails
- Separate fields for AI classification vs manual override: `classification` (value), `classificationSource` (ai/manual/rules) — AI result is preserved even after manual reclassification
- Manual override does NOT overwrite the original AI classification; both are stored

### Classify skill design
- Agent receives the email content PLUS guest match context (uses `search_guests` tool to check if sender is known guest)
- Single `classify_email` tool call writes ALL results: category, matchedGuestId, language (en/de), extractedName, extractedPhone, extractedDates, extractedDietaryNeeds, confidence, reasoning
- One agent session, one tool call — efficient pipeline
- SKILL.md includes synthetic (fake but realistic) email examples covering each category
- Integration via OpenClaw hook mechanism: backend POSTs to `/hooks/classify` with email data, consistent with existing `draft`, `briefing`, `alert` hooks in `openclaw.json`

### Email threading resolution
- Current threader (`email-threader.ts`) has not been deeply tested with real volume yet
- Evaluate current approach, add comprehensive tests for edge cases (multi-hop forwards, broken References, missing In-Reply-To)
- `classificationMeta` JSON field stores full AI reasoning (why it chose this category, what signals it found) — useful for debugging misclassifications

### Schema migration strategy
- Backfill existing conversations with `classificationSource='rules'` during migration — data is clean from day one
- `otaParsedData` as JSON column (`Json?` in Prisma) — flexible for different OTA platforms without per-platform migrations
- `classificationMeta` stores full AI reasoning text — not just key facts, the complete thought process
- New fields are nullable for forward compatibility

### Claude's Discretion
- Exact category set beyond the current 4 (whether to add `booking_confirmation` or other categories)
- Tab-to-category mapping rules (which categories appear in which tab)
- Category renaming — if Claude's chosen category set differs from current 4, migration transforms old values
- Whether to add subject-line fallback for threading (researcher should investigate GMX header behavior first)
- Whether to optimize threading queries (single IN query vs individual lookups)
- Whether to use a threading library or keep the custom implementation (evaluate based on research)

</decisions>

<specifics>
## Specific Ideas

- The classify hook should follow the exact same pattern as the existing `draft` hook in `openclaw.json` — `"action": "agent"`, with a skill-specific `sessionKey`
- The AI's classification reasoning should be stored so Ines can understand WHY something was classified a certain way if she disagrees
- Existing conversations should show `classificationSource='rules'` so it's clear they weren't AI-classified

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `email-classifier.ts`: Rules-based classifier with 4 categories + `AiClassifier` interface stub ready for AI implementation
- `email-threader.ts`: `findConversationByHeaders()` and `buildReferencesChain()` — current threading logic to evaluate
- `contact-matcher.ts`: `matchOrCreateGuest()` — existing guest matching (to be replaced by agent's `search_guests` tool usage)
- `openclaw.json`: Existing hook configuration with `draft`, `briefing`, `alert` mappings — classify hook follows same pattern
- `openclaw-plugin/tools/guests.ts`: Existing `search_guests` tool in the plugin — agent uses this during classification
- `QUEUE_NAMES` in `packages/shared/src/types/jobs.ts`: Queue name constants — add `AI_CLASSIFY` here
- `queue.ts`: Queue registration pattern with retry strategies — follow for new classify queue

### Established Patterns
- Queue types defined in shared package (`@pyr/shared`), registered in `queue.ts` with retry config
- Hook mappings in `openclaw.json` use `"action": "agent"` with `agentId`, `sessionKey`, `deliver` fields
- Conversation service already accepts `classification` field in `updateConversation()` — extend for new fields
- All mutations use `$transaction` with `writeAuditLog` — follow for classification writes
- Plugin tools in `openclaw-plugin/tools/` export tool definitions with typed parameter schemas

### Integration Points
- `packages/shared/src/types/jobs.ts`: Add `AI_CLASSIFY` to `QUEUE_NAMES` and `AiClassifyJobData` type
- `packages/backend/src/services/queue/queue.ts`: Register new classify queue with retry strategy
- `packages/backend/prisma/schema.prisma`: Add 7 new fields to Conversation model
- `openclaw/openclaw.json`: Add `classify` hook mapping
- `packages/assistant/openclaw-plugin/`: Add `classify_email` tool
- `openclaw/skills/classify/SKILL.md`: New skill file (directory doesn't exist yet)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-schema*
*Context gathered: 2026-03-01*
