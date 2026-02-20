# Phase 5: AI-Email Integration - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the AI communication engine (Phase 4) into the email ingestion pipeline (Phases 2/3) so inbound guest emails automatically get AI-drafted replies. Ines can approve, edit, or reject drafts from the inbox UI. Includes an FAQ knowledge base that injects into AI context for more accurate responses. Automated tests verify the full draft pipeline.

</domain>

<decisions>
## Implementation Decisions

### Draft trigger rules
- All guest emails get auto-drafted — inquiries, follow-ups, questions, short replies
- Every inbound message in a thread gets a fresh draft, even in long conversations — Ines can ignore drafts she doesn't need
- OTA booking notification emails (Tripaneer, BookYogaRetreats) do NOT get drafts — they're processed for booking extraction only
- Spam/newsletter classified emails do NOT get drafts
- Draft generation triggers immediately on email ingestion — no delay, target under 30 seconds total

### Draft review workflow
- Draft appears inline in the conversation thread as a visually distinct card (different background/border) with action buttons
- Approve flow: clicking "Approve" opens a preview with the final email text, then a "Send" button to confirm — two-step to prevent accidental sends
- Edit flow: the draft card becomes editable in-place — Ines types changes directly, then clicks Send
- Reject + regenerate: after rejecting, a "Generate new draft" button appears so Ines can try for a better response
- One active draft per message — regenerating replaces the old draft, no history kept

### FAQ management
- Flat list of Q&A pairs with optional tags for filtering — no rigid category hierarchy
- FAQ entries are English only — the AI translates on the fly when drafting in German for German-speaking guests
- FAQ management lives under the Settings page as a tab/section, alongside other admin tools
- All FAQ entries have equal weight — AI uses semantic relevance to pick which ones apply, no manual priority/ordering

### Edge-case handling
- Flagged emails (complaints, medical/dietary requests, cancellations, adoption inquiries) still get auto-drafted, but with a visible warning badge (e.g., "Complaint detected — review carefully")
- No confidence indicator on drafts — Ines reviews every draft anyway, extra metadata is noise
- If draft generation fails (LLM error/timeout), show a notice on the conversation: "Draft generation failed" with a manual "Retry" button

### Claude's Discretion
- Exact visual styling of draft cards (colors, borders, badge design)
- Preview dialog layout for the approve flow
- How FAQ tags are presented and filtered in the Settings UI
- Retry logic details (number of automatic retries before showing failure notice)
- How semantic FAQ relevance matching works internally

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-ai-email-integration*
*Context gathered: 2026-02-20*
