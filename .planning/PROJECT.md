# PYR Inbox & AI Pipeline Rework

## What This Is

A complete rework of the Puppy Yoga Retreat platform's email inbox, classification, and AI draft systems. Replaces the current rules-based classifier and auto-creation pipeline with OpenClaw-powered agent sessions that classify emails, match guests, and generate drafts through full LLM reasoning with tool access. The existing email connection code (IMAP/SMTP) is preserved; everything above it is rebuilt from scratch.

## Core Value

Emails are correctly classified and routed by an AI agent that can reason about context (guest history, booking data, OTA patterns), with Ines always in control of guest creation and draft sending.

## Requirements

### Validated

<!-- Existing capabilities that work and must not break -->

- ✓ IMAP email polling (connect-per-poll, UID-based incremental, GMX support) — existing
- ✓ SMTP outbound sending (threading headers, signature injection) — existing
- ✓ Email parsing and HTML sanitization (mailparser + sanitize-html) — existing
- ✓ OTA email parsing (Tripaneer/BookYogaRetreats strategy pattern) — existing
- ✓ OpenClaw agent runtime with 40 tools (gateway WebSocket + RPC) — existing
- ✓ Two-step confirmation flow for write operations — existing
- ✓ Dashboard chat with Koda (SSE streaming) — existing
- ✓ WhatsApp channel integration — existing
- ✓ Attachment storage in PostgreSQL — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] OpenClaw-powered email classification (full agent session with tools, not rules-based)
- [ ] Three-tab inbox UI: Conversations, OTA, Other
- [ ] Guest matching via OpenClaw (search existing guests using tools during classification)
- [ ] Inline banner UI for unmatched guests ("No matching guest found — Create [Name] [Email]?")
- [ ] Language detection and guest info extraction in classification session
- [ ] OTA emails: parsed booking data displayed in UI but no auto-creation of bookings or guests
- [ ] OpenClaw suggests guest matches for OTA emails
- [ ] Manual draft generation triggered by Ines (no auto-drafts)
- [ ] Draft generation as full OpenClaw agent session with context and tools
- [ ] Remove all automatic guest creation from email pipeline
- [ ] Remove automatic draft generation on email arrival
- [ ] Email threading: research and implement best approach (keep current, library, or rewrite)
- [ ] Production-ready with comprehensive test coverage
- [ ] Full documentation (OpenClaw workspace docs, API docs, architecture)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Auto-sending emails without Ines approval — core business rule, never auto-send
- Auto-creating bookings from OTA emails — removed; show parsed data for manual action
- Auto-creating guests from incoming emails — removed; Ines decides via UI
- WhatsApp/Instagram inbox channels — Phase 3, channel field ready but no connector
- Multi-user/multi-tenant — single admin (Ines) for MVP
- New OTA parsers beyond Tripaneer/BookYogaRetreats — existing parsers sufficient for now

## Context

### Existing System (What We're Replacing)

The current inbox pipeline is rules-based and over-automated:

1. **Classifier** (`email-classifier.ts`): Pattern matching on sender domains and subjects. Fixed rules, no AI reasoning. Categories: guest_inquiry, ota_notification, spam_newsletter, admin_system.
2. **Contact Matcher** (`contact-matcher.ts`): Auto-creates guest CRM records from email senders. No human confirmation. Creates noise in guest database.
3. **AI Drafts** (`draft-generator.ts`): Auto-generates drafts for every guest_inquiry via BullMQ job. Builds prompts directly and calls gateway RPC. Not a full agent session — no tool access during drafting.
4. **OTA Pipeline**: Auto-creates bookings from parsed OTA emails. Too aggressive — creates records before Ines reviews.

### OpenClaw Architecture

OpenClaw is the AI agent runtime powering Koda (the business assistant). Key integration points:

- **Gateway**: WebSocket + HTTP at `localhost:18789`. RPC protocol v3.
- **Hooks**: Named endpoints (`draft`, `briefing`, `alert`) that trigger agent sessions. A new `classify` hook is needed.
- **Plugin**: `packages/assistant/openclaw-plugin/` — 40 tools across 10 categories. Tools like `search_guests`, `update_conversation`, `get_conversation` are directly relevant to classification.
- **Skills**: `openclaw/workspace/skills/` — domain knowledge files that inform agent behavior. Draft generation skill exists at `skills/draft/SKILL.md`.
- **Config**: `openclaw/openclaw.json` — agent config, hook mappings, plugin loading.

### What Gets Rewritten vs Preserved

| Component | Action | Location |
|-----------|--------|----------|
| IMAP service | **Keep** | `services/email/imap.service.ts` |
| SMTP service | **Keep** | `services/email/smtp.service.ts` |
| Email parser | **Keep** | `services/email/email-parser.ts` |
| Language detector | **Evaluate** | `services/email/language-detector.ts` (OpenClaw may replace) |
| Email classifier | **Remove** | `services/email/email-classifier.ts` |
| Contact matcher | **Remove** | `services/email/contact-matcher.ts` |
| Email threader | **Research** | `services/email/email-threader.ts` (keep/lib/rewrite TBD) |
| OTA parsers | **Keep** | `services/email/ota-parsers/` (parse but don't auto-act) |
| Draft generator | **Rewrite** | `services/ai/draft-generator.ts` (full agent session) |
| Email module orchestrator | **Rewrite** | `services/email/index.ts` |
| Inbox routes | **Rewrite** | `modules/inbox/` |
| Inbox frontend | **Rewrite** | `components/features/inbox/` |
| BullMQ jobs | **Modify** | `queue/jobs/ai-draft.job.ts` (remove auto-trigger) |

## Constraints

- **OpenClaw dependency**: Classification and drafting depend on OpenClaw gateway being available. Must handle gateway-down gracefully (queue and retry, or fall back to manual classification).
- **Latency**: Full agent sessions take 5-30 seconds. Classification must not block email polling. Use async queue (BullMQ).
- **Token cost**: Every email triggers an agent session for classification. Must track costs. Consider batching or caching for duplicate/similar emails.
- **Existing data**: Database has existing conversations, messages, drafts. Migration must preserve data integrity.
- **Single admin**: Ines is the only user. UI optimized for her workflow.
- **Tech stack**: TypeScript strict, Fastify, Next.js, Prisma, BullMQ, shadcn/ui — all existing stack constraints apply.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| OpenClaw for classification (not rules) | AI reasoning with tool access beats pattern matching for accuracy; can cross-reference guest data | — Pending |
| Remove auto guest creation | Too much noise in CRM; Ines should control who becomes a guest record | — Pending |
| Manual draft trigger only | Auto-drafts generate unnecessary AI costs; Ines may not need a draft for every email | — Pending |
| Full agent sessions for both classify and draft | Consistent architecture; both benefit from tool access and full context | — Pending |
| Three tabs (Conversations/OTA/Other) | Clear information architecture matching Ines's mental model | — Pending |
| OTA: parse but don't auto-create | Show extracted data for Ines to act on manually; reduces errors from bad parses | — Pending |

---
*Last updated: 2026-03-01 after initialization*
