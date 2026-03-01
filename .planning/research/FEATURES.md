# Feature Research

**Domain:** AI-classified business email inbox with guest matching and draft generation for a small business CRM
**Researched:** 2026-03-01
**Confidence:** HIGH (based on existing codebase analysis, competitor feature analysis, established UX patterns)

## Feature Landscape

### Table Stakes (Users Expect These)

Features the admin (Ines) will expect from day one. Missing any of these makes the rework feel like a regression from the current system.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **AI classification on ingest** | Every email needs a category before it reaches the inbox. Without it, emails pile up unorganized. Gmail, Front, Intercom all classify on arrival. | MEDIUM | OpenClaw agent session per email. Must handle gateway-down gracefully (queue + retry). Async via BullMQ so polling is never blocked. |
| **Three-tab inbox (Conversations / OTA / Other)** | Ines's mental model: guest emails are primary work, OTA notifications are reference, everything else is noise. Tabs match Gmail's proven pattern (Primary/Social/Promotions). | LOW | Frontend filter on `classification` field. Conversations = `guest_inquiry`, OTA = `ota_notification`, Other = `spam_newsletter` + `admin_system`. |
| **Classification confidence + reason** | Ines needs to trust AI decisions. Showing "why" builds trust and helps her spot misclassifications. Helpdesk tools (Freshdesk, Zendesk) all expose confidence scores. | LOW | Already in `ClassificationResult` type (`confidence`, `reason`). Store on conversation/message record. Display in UI. |
| **Manual reclassification** | AI will get it wrong sometimes. Override must be one click, not buried in settings. Already exists in current UI (`ReclassifyDropdown`). | LOW | Already built. Enhance to move conversation between tabs immediately on reclassify. Add audit log entry for reclassification. |
| **Guest matching during classification** | The core value proposition. When classifying, the AI should search existing guests (by email, name, phone) and link the conversation. Without this, every email is an orphan. | MEDIUM | OpenClaw has `search_guests` tool. Classification session uses it to find matches. Returns guest ID + match confidence. |
| **Unmatched guest banner with create action** | When no guest match is found, Ines needs a clear prompt to create one. Not auto-create (that's what we're removing), but a banner: "No matching guest -- Create [Name] [Email]?" | LOW | Inline banner component. Pre-fills name and email from email headers. One-click creates guest via existing API, then links conversation. |
| **Manual draft generation (button-triggered)** | Ines decides when she wants an AI draft, not the system. Button in conversation thread, spinner while generating, result appears inline. Already partially built. | LOW | Existing `Generate AI Draft` button + `DraftCard` component. Wire to OpenClaw hook instead of direct gateway call. |
| **Draft review/edit/approve/reject flow** | AI drafts are never auto-sent. Ines must review, optionally edit, then explicitly approve. Two-step confirm dialog before sending. Industry standard (Superhuman, Front, Help Scout all do this). | LOW | Already fully built with `DraftCard` component: edit mode, approve with preview dialog, reject with regenerate option. |
| **Draft cost and token display** | Ines runs a small business -- she cares about AI costs. Show model, tokens, cost per draft. Transparency builds trust. | LOW | Already built. `DraftCard` shows model, input/output tokens, cost in EUR, cache hit indicator, duration. |
| **Conversation threading** | Emails in the same thread must stay together. Broken threading = broken inbox. Uses `In-Reply-To` and `References` headers. | MEDIUM | Existing `email-threader.ts` needs evaluation (keep/rewrite). Must correctly handle reply chains, forwarded emails, and OTA notification threading. |
| **Unread/read state** | Basic inbox hygiene. Unread dot on conversation list, bold text for unread items. | LOW | Already built (`isRead` field, blue dot in `ConversationList`). |
| **Email HTML rendering** | Many emails are HTML-formatted. Must render safely (sanitized) with readable formatting. | LOW | Already built (`email-html-renderer.tsx`, `sanitize-html` on backend). |
| **OTA parsed data display** | For OTA tab, show extracted booking data (guest name, dates, room type, price) from parsed OTA emails. Not auto-create -- just display for Ines to act on. | MEDIUM | Existing OTA parsers (Tripaneer, BookYogaRetreats) extract structured data. Display in OTA conversation view as a card/panel. Ines manually creates booking from parsed data. |
| **Search/filter within tabs** | With growing email volume, Ines needs to find specific conversations. Search by guest name, email, subject. Filter by status (open/closed). | LOW | Existing `?search=` and `?status=` query params on conversations endpoint. Add search input to tab header. |
| **Graceful degradation when OpenClaw is down** | OpenClaw gateway may be unavailable. Classification must not lose emails. Queue unclassified emails, show them in a "Pending" state, allow manual classification. | MEDIUM | BullMQ retry with backoff. Frontend shows "Classification pending" badge. Manual classify dropdown always available as fallback. |

### Differentiators (Competitive Advantage)

Features that make PYR's inbox meaningfully better than a generic CRM inbox. These justify the AI investment and are where the product creates real value for Ines.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **OpenClaw agent sessions for classification** | Unlike rule-based or simple ML classifiers, a full agent session can use tools: search guests, check bookings, look at conversation history. Classification is contextual, not just pattern matching on sender domain. | HIGH | New `classify` hook in OpenClaw config. Agent gets email content + metadata, uses `search_guests`, `get_conversation` tools to make informed decisions. Returns category, confidence, matched guest ID, extracted language, extracted guest info. |
| **Smart guest matching with fuzzy search** | Agent doesn't just do exact email match -- it can search by name variations, phone fragments, previous conversation subjects. Catches "Sara K." = "Sarah Khan" that exact match misses. | MEDIUM | Leverage existing `search_guests` tool which does text search. OpenClaw agent can try multiple search strategies (email, then name, then phone) and reason about results. |
| **Language detection in classification** | The agent detects guest language (EN/DE) during classification, not as a separate step. Stored on conversation and used for draft generation. Eliminates the current regex-based `language-detector.ts`. | LOW | OpenClaw agent can detect language with high accuracy as part of classification. One agent call covers both classification and language detection. |
| **Guest info extraction during classification** | The classification agent extracts structured info from the email: guest name, phone, dietary needs, travel dates, party size. Stored on conversation metadata. Saves Ines from re-reading emails to extract data. | MEDIUM | Agent returns extracted fields as structured JSON. Stored in a new `metadata` JSON field on conversation or message. Displayed in conversation header panel. |
| **Draft generation as full agent session with tools** | Unlike current direct LLM call, the draft agent has access to all 40 OpenClaw tools. It can check room availability, look up booking details, check event schedules -- then compose a reply with accurate, current information. | HIGH | Already partially built (draft generator uses gateway). Key improvement: use the `draft` hook which gives full tool access, not just `extraSystemPrompt` injection. |
| **Edge-case flags on drafts** | AI detects sensitive topics (complaints, cancellations, medical/dietary, adoption inquiries) and flags them visually on the draft card. Forces careful review of high-stakes replies. | LOW | Already built. `classifyEdgeCases()` returns flags, `DraftCard` shows amber/red badges. Consider moving edge-case detection into the OpenClaw classification session for consistency. |
| **OTA guest matching suggestions** | For OTA emails, the agent suggests which existing guest the booking might be for (by name/email from parsed data). Helps Ines link OTA bookings to existing guest records without manual lookup. | MEDIUM | Classification agent processes OTA parsed data, runs `search_guests` with extracted guest name/email. Shows suggested matches in OTA conversation view. |
| **Conversation-level classification audit trail** | Track classification changes over time: initial AI classification, manual overrides, re-classifications. Shows who changed what and when. Useful for tuning AI accuracy. | LOW | Use existing `audit_log` table. Log initial classification + any reclassifications. Could aggregate for classification accuracy metrics later. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem useful but create real problems. Deliberately NOT building these.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Auto-create guests from emails** | "Save Ines time by auto-creating guest records." | Creates noise: spam senders, OTA system addresses, newsletter replies all become CRM records. Current system does this and it pollutes the guest database. Ines spends time deleting ghost guests. | Banner with one-click create. Ines sees name + email, clicks "Create Guest." Two seconds vs. cleaning up junk records. |
| **Auto-send AI drafts** | "If AI is confident, just send it." | Core business rule violation. One wrong auto-sent email to a guest with a complaint, dietary emergency, or pricing question causes real harm. Ines's personal brand is at stake. Superhuman and Front both keep human-in-the-loop. | Always require explicit approve. Two-step confirm dialog prevents accidental sends. |
| **Auto-create bookings from OTA emails** | "OTA emails contain booking data, just create the booking automatically." | OTA parsers aren't 100% accurate. Wrong dates, wrong room types, wrong prices get committed to DB. Ines then has to find and fix them. Previous implementation did this and it caused problems. | Show parsed data in UI card. Ines reviews and clicks "Create Booking" with pre-filled form. |
| **Real-time streaming classification** | "Show classification results as they stream in from the agent." | Classification takes 5-15 seconds. Streaming partial results is confusing (category might change mid-stream). The final result is what matters. | Show "Classifying..." spinner, then final result. No partial state. |
| **Bulk AI draft generation** | "Generate drafts for all unresponded conversations at once." | Expensive (each draft costs tokens), wasteful (Ines may not need a draft for every email), and floods the inbox with pending drafts. | One-at-a-time manual trigger. Ines opens a conversation, decides she wants help, clicks generate. |
| **AI confidence threshold auto-routing** | "Above 90% confidence, auto-classify. Below, ask the human." | Single-user system. Adding complexity of threshold configuration for one user adds engineering cost without proportional value. Every email gets classified; Ines can override with one click. | Always show classification with confidence. Let Ines override when she disagrees. Track overrides for future accuracy analysis (but don't build the threshold system). |
| **Multi-model classification comparison** | "Run classification through Claude AND GPT, compare results." | Doubles cost, doubles latency, adds complexity. For a small business with moderate email volume, one model with manual override is sufficient. | Use one model (Claude via OpenClaw). If accuracy is poor, improve the classification prompt/skill rather than adding a second model. |
| **Sentiment analysis scoring** | "Score each email's emotional tone on a 1-10 scale." | Over-engineering for small business. Ines reads the emails -- she can tell when someone is upset. A numeric score adds UI clutter without actionable insight at this scale. | Edge-case flags (complaint, cancellation) cover the high-stakes cases. The flag system is binary and actionable, not a gradient. |

## Feature Dependencies

```
[AI Classification (OpenClaw hook)]
    |
    +--requires--> [OpenClaw gateway available]
    |
    +--produces--> [Classification result (category, confidence, reason)]
    |
    +--uses-----> [Guest matching via search_guests tool]
    |                  |
    |                  +--enables--> [Auto-link conversation to guest]
    |                  |
    |                  +--enables--> [Unmatched guest banner in UI]
    |
    +--uses-----> [Language detection (inline)]
    |
    +--uses-----> [Guest info extraction (metadata)]
    |
    +--produces--> [Tab routing (Conversations/OTA/Other)]

[Three-tab inbox UI]
    |
    +--requires--> [Classification result on each conversation]
    |
    +--requires--> [Search/filter within tabs]

[Manual draft generation]
    |
    +--requires--> [OpenClaw draft hook (existing)]
    |
    +--requires--> [Conversation linked to guest (for context)]
    |
    +--produces--> [DraftCard in conversation thread]
    |
    +--uses-----> [OpenClaw tools (availability, bookings, events)]

[OTA parsed data display]
    |
    +--requires--> [OTA parser output (existing Tripaneer/BookYogaRetreats)]
    |
    +--requires--> [Classification = ota_notification]
    |
    +--enhances--> [OTA guest matching suggestions]

[Graceful degradation]
    |
    +--requires--> [BullMQ retry infrastructure (existing)]
    |
    +--fallback--> [Manual classification dropdown (existing)]
```

### Dependency Notes

- **AI Classification requires OpenClaw gateway:** The entire classification pipeline depends on the gateway being available. This is the single biggest dependency and the reason graceful degradation is table stakes, not a differentiator.
- **Three-tab inbox requires classification:** Tabs are just a filter on classification. If classification fails, conversations land in a "Pending" state. The UI must handle unclassified conversations gracefully.
- **Draft generation requires guest linkage:** Drafts without guest context produce generic replies. The classification step (which links guest) should precede any draft generation. A draft for an unlinked conversation should warn Ines that context is limited.
- **OTA guest matching enhances OTA display:** The OTA data card works without guest matching (just shows parsed data). Guest matching adds the "This might be [existing guest]" suggestion, which is additive not blocking.
- **Edge-case flags work independently:** The flag system (complaint, cancellation, medical, dietary, adoption) can run during classification OR during draft generation. Moving it to classification means flags appear earlier (before Ines even opens the conversation).

## MVP Definition

### Launch With (v1)

Minimum viable rework -- what's needed to replace the current rules-based system without regression.

- [ ] **OpenClaw classification hook** -- Agent session that classifies emails, searches guests, returns category + confidence + matched guest ID + language
- [ ] **Three-tab inbox UI** -- Conversations / OTA / Other tabs filtering by classification
- [ ] **Guest matching in classification** -- Agent uses `search_guests` to find and auto-link guests during classification
- [ ] **Unmatched guest banner** -- "No matching guest found -- Create [Name] [Email]?" inline banner with one-click create
- [ ] **Manual draft generation** -- Existing button-triggered flow, rewired to use OpenClaw draft hook with full tool access
- [ ] **Draft review/edit/approve/reject** -- Already built, keep as-is
- [ ] **Remove auto-guest-creation** -- Delete `contact-matcher.ts` auto-create path
- [ ] **Remove auto-draft generation** -- Remove BullMQ job that auto-triggers drafts on email arrival
- [ ] **Graceful degradation** -- Queue + retry when gateway is down, "Pending" state in UI, manual classify fallback
- [ ] **Classification confidence display** -- Show confidence + reason in conversation header

### Add After Validation (v1.x)

Features to add once the core rework is stable and Ines has used it for a week.

- [ ] **Guest info extraction in classification** -- Agent extracts name, phone, dates, party size, dietary needs from email body. Add when classification accuracy is validated.
- [ ] **OTA guest matching suggestions** -- "This booking might be for [existing guest]" in OTA tab. Add after OTA classification is working reliably.
- [ ] **Edge-case flags in classification** -- Move flag detection from draft-time to classification-time so flags appear in conversation list. Add after core classification is solid.
- [ ] **Classification accuracy tracking** -- Log initial classification vs. manual overrides. Dashboard widget showing accuracy over time. Add when enough data exists to be meaningful.

### Future Consideration (v2+)

Features to defer until the inbox rework has been in production for weeks.

- [ ] **Batch reclassification** -- Select multiple conversations, reclassify in bulk. Defer until volume justifies it.
- [ ] **Classification prompt tuning UI** -- Let Ines provide feedback that improves the classification prompt. Defer because prompt engineering is developer work for now.
- [ ] **AI-suggested actions in conversation** -- Beyond drafting: "This guest is asking about availability -- want me to check?" Defer because it blurs the line between inbox and assistant (Koda already does this in chat).
- [ ] **Multi-channel classification** -- WhatsApp and Instagram messages going through same classification pipeline. Defer to Phase 3 channel expansion.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| AI classification (OpenClaw hook) | HIGH | HIGH | P1 |
| Three-tab inbox UI | HIGH | LOW | P1 |
| Guest matching in classification | HIGH | MEDIUM | P1 |
| Unmatched guest banner | HIGH | LOW | P1 |
| Manual draft generation (rewired) | HIGH | MEDIUM | P1 |
| Remove auto-guest-creation | HIGH | LOW | P1 |
| Remove auto-draft generation | HIGH | LOW | P1 |
| Graceful degradation | HIGH | MEDIUM | P1 |
| Classification confidence display | MEDIUM | LOW | P1 |
| Draft review/edit/approve flow | HIGH | LOW | P1 (already built) |
| Guest info extraction | MEDIUM | MEDIUM | P2 |
| OTA guest matching suggestions | MEDIUM | MEDIUM | P2 |
| Edge-case flags in classification | MEDIUM | LOW | P2 |
| Classification accuracy tracking | LOW | MEDIUM | P2 |
| Batch reclassification | LOW | MEDIUM | P3 |
| Classification prompt tuning UI | LOW | HIGH | P3 |
| AI-suggested actions | LOW | HIGH | P3 |
| Multi-channel classification | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (the rework is incomplete without these)
- P2: Should have, add in the first iteration after launch
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Gmail AI Inbox (2026) | Front | Intercom | Superhuman | PYR Approach |
|---------|----------------------|-------|----------|------------|--------------|
| AI classification | Personalized categories with summaries | Smart QA scoring, keyword routing | Intent + language + sentiment auto-triage | Auto-categorization by priority | OpenClaw agent session with tool access (contextual, not just NLP) |
| Confidence/reasoning | Hidden (auto-routes) | Not exposed | Confidence thresholds configurable | Not exposed | Visible confidence + reason (transparency for single admin) |
| Draft generation | Smart Reply (short), Gemini compose | Team templates + AI | Copilot drafts in inbox | Instant Reply in your voice | Full agent session with business tools (availability, bookings, pricing) |
| Human approval | Drafts in compose, user sends | Shared draft review | Agent review queue | One-click send | Two-step approve dialog, edit mode, reject + regenerate |
| Contact matching | Google Contacts auto-link | CRM contact lookup | Company/user auto-match | No CRM | AI agent searches CRM guests with fuzzy matching during classification |
| Tabbed categories | Primary/Social/Promotions/Updates | Tags and views | Inbox segments | Split inbox | 3 tabs (Conversations/OTA/Other) matching business categories |
| Graceful AI failure | Falls back to chronological | Manual workflows | Human escalation | Degrades to basic inbox | Queue + retry, manual classify, "Pending" state |
| Cost tracking | Hidden | Not applicable | Not exposed | Not applicable | Per-draft cost in EUR, token counts, cache hit indicators |

## Sources

- [Gmail AI Inbox Categorization Guide](https://www.getmailbird.com/gmail-ai-inbox-categorization-guide/) -- Gmail's 2026 AI Inbox features and categories
- [Gmail AI Inbox -- TechCrunch](https://techcrunch.com/2026/01/08/gmail-debuts-a-personalized-ai-inbox-ai-overviews-in-search-and-more/) -- Gmail AI Inbox launch announcement
- [EmailTree AI Classification](https://emailtree.ai/ai-email-classification/) -- Enterprise email classification capabilities
- [Superhuman AI Features](https://superhuman.com/products/mail/ai) -- Instant Reply, Auto Summarize, AI-native email
- [Front Review 2026](https://efficient.app/apps/front) -- Front shared inbox features and AI capabilities
- [Intercom AI Review 2026](https://reply.io/blog/intercom-ai-review/) -- Intercom AI Copilot, triage, routing
- [Freshdesk AI Features](https://www.eesel.ai/blog/freshdesk-ai-features) -- AI classification, agent assist
- [Setting Confidence Thresholds for AI Responses](https://www.eesel.ai/blog/setting-confidence-thresholds-for-ai-responses) -- Confidence threshold patterns
- [Fuzzy Matching Guide](https://winpure.com/fuzzy-matching-guide/) -- Fuzzy matching techniques for CRM data
- [CRM Email Integration Patterns](https://www.aurinko.io/blog/crm-email-integration-recreating-inbox-mistake/) -- CRM inbox integration anti-patterns
- [AI Email Draft Reply Workflows](https://www.relay.app/blog/how-to-use-ai-to-automatically-draft-email-replies) -- Draft generation and approval workflows
- Existing PYR codebase analysis: `email-classifier.ts`, `contact-matcher.ts`, `draft-generator.ts`, `inbox-page.tsx`, `draft-card.tsx`, `conversation-thread.tsx`, `reclassify-dropdown.tsx`, OpenClaw plugin tools

---
*Feature research for: AI-classified business inbox with guest matching and draft generation*
*Researched: 2026-03-01*
