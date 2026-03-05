import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';
import { storePendingAction } from '../lib/confirmation.js';
import { formatDateTime } from '../lib/formatters.js';

// ─── Types from API responses ────────────────────────────

interface Conversation {
  id: string;
  subject: string | null;
  status: string;
  guest?: { id: string; name: string; email: string | null };
}

interface AiDraft {
  id: string;
  content: string;
  status: string;
  model: string | null;
  createdAt: string;
}

interface DraftGenerateResult {
  jobId: string;
  messageId: string;
}

// ─── Tool Registration ───────────────────────────────────

export function registerDraftTools(api: OpenClawPluginApi, client: ApiClient): void {
  // ── 1. List Pending Drafts ─────────────────────────────

  api.registerTool({
    name: 'list_pending_drafts',
    label: 'List Pending Drafts',
    description:
      'List AI-generated email drafts that are waiting for approval. Shows a preview of each draft with guest name and subject.',
    parameters: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max conversations to check (default 10)', default: 10 },
      },
      required: [],
    },
    async execute(_id: string, params: { limit?: number }) {
      const limit = params.limit ?? 10;

      // Get recent open conversations
      const conversations = await client.get<Conversation[]>('/api/v1/conversations', {
        status: 'open',
        limit,
      });
      const convList = conversations as unknown as Conversation[];

      // Fetch drafts for each conversation and filter for pending
      const pendingDrafts: Array<Record<string, unknown>> = [];

      for (const conv of convList) {
        try {
          const drafts = await client.get<AiDraft[]>(`/api/v1/conversations/${conv.id}/drafts`);
          const draftList = drafts as unknown as AiDraft[];
          const pending = draftList.filter((d) => d.status === 'pending');

          for (const draft of pending) {
            pendingDrafts.push({
              draftId: draft.id,
              conversationId: conv.id,
              guestName: conv.guest?.name ?? 'Unknown',
              guestEmail: conv.guest?.email,
              subject: conv.subject,
              preview: draft.content.length > 200 ? draft.content.slice(0, 200) + '...' : draft.content,
              createdAt: formatDateTime(draft.createdAt),
            });
          }
        } catch {
          // Skip conversations where drafts fail to load
        }
      }

      if (pendingDrafts.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              message: 'No pending drafts found. All caught up!',
              totalPending: 0,
            }, null, 2),
          }],
          details: {},
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            pendingDrafts,
            totalPending: pendingDrafts.length,
            instruction: 'Present these drafts as a list. Ines can say "show draft for [guest name]" to see the full email, or "approve" / "reject" to act on one.',
          }, null, 2),
        }],
        details: {},
      };
    },
  });

  // ── 2. Show Draft ──────────────────────────────────────

  api.registerTool({
    name: 'show_draft',
    label: 'Show Draft',
    description:
      'Show the full content of an AI email draft including To, Subject, and Body. Use this before approving so Ines can review the complete email.',
    parameters: {
      type: 'object' as const,
      properties: {
        conversationId: { type: 'string', description: 'The conversation ID' },
        draftId: { type: 'string', description: 'The draft ID' },
      },
      required: ['conversationId', 'draftId'],
    },
    async execute(_id: string, params: { conversationId: string; draftId: string }) {
      // Fetch conversation for header info
      const conv = await client.get<Conversation>(`/api/v1/conversations/${params.conversationId}`);
      const conversation = conv as unknown as Conversation;

      // Fetch drafts to find the specific one
      const drafts = await client.get<AiDraft[]>(`/api/v1/conversations/${params.conversationId}/drafts`);
      const draftList = drafts as unknown as AiDraft[];
      const draft = draftList.find((d) => d.id === params.draftId);

      if (!draft) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: `Draft not found. It may have already been approved, rejected, or regenerated.`,
            }, null, 2),
          }],
          details: {},
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            to: conversation.guest?.email ?? 'Unknown',
            guestName: conversation.guest?.name ?? 'Unknown',
            subject: conversation.subject ?? '(no subject)',
            body: draft.content,
            status: draft.status,
            model: draft.model,
            createdAt: formatDateTime(draft.createdAt),
            conversationId: params.conversationId,
            draftId: draft.id,
            instruction: 'Show the full email draft with To, Subject, and Body, then ask: Reply OK to send or Cancel to discard.',
          }, null, 2),
        }],
        details: {},
      };
    },
  });

  // ── 3. Generate Draft ──────────────────────────────────

  api.registerTool({
    name: 'generate_conversation_draft',
    label: 'Generate Conversation Draft',
    description:
      'Trigger AI draft generation for the latest inbound message in a conversation. Use this when Ines says "make a draft for this thread".',
    parameters: {
      type: 'object' as const,
      properties: {
        conversationId: { type: 'string', description: 'The conversation ID' },
      },
      required: ['conversationId'],
    },
    async execute(_id: string, params: { conversationId: string }) {
      try {
        const result = await client.post<DraftGenerateResult>(
          `/api/v1/conversations/${params.conversationId}/drafts/generate`,
        );
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: 'Draft generation started. Use "list pending drafts" in a moment to review it.',
              conversationId: params.conversationId,
              jobId: result.jobId,
              messageId: result.messageId,
            }, null, 2),
          }],
          details: {},
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate draft';
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: `${message}. No changes were applied.`,
            }, null, 2),
          }],
          details: {},
        };
      }
    },
  });

  // ── 4. Approve Draft ───────────────────────────────────

  api.registerTool({
    name: 'approve_draft',
    label: 'Approve Draft',
    description:
      'Queue a draft email for sending. This stores the approval as a pending action -- Ines must confirm with OK before the email is actually sent. Supports optional edited content so Ines can rewrite text in chat and send that exact version. Uses the same two-step confirmation as other write actions.',
    parameters: {
      type: 'object' as const,
      properties: {
        conversationId: { type: 'string', description: 'The conversation ID' },
        draftId: { type: 'string', description: 'The draft ID to approve' },
        content: {
          type: 'string',
          description: 'Optional edited email body to send instead of stored draft content',
        },
      },
      required: ['conversationId', 'draftId'],
    },
    async execute(
      _id: string,
      params: { conversationId: string; draftId: string; content?: string },
    ) {
      // Fetch conversation to get guest info for the confirmation summary
      const conv = await client.get<Conversation>(`/api/v1/conversations/${params.conversationId}`);
      const conversation = conv as unknown as Conversation;
      const editedContent = typeof params.content === 'string' ? params.content.trim() : '';

      const actionId = crypto.randomUUID();

      storePendingAction({
        id: actionId,
        type: 'approve_draft',
        summary: editedContent
          ? `Send edited email draft to ${conversation.guest?.name ?? 'unknown guest'} (${conversation.guest?.email ?? 'no email'}) re: ${conversation.subject ?? '(no subject)'}`
          : `Send email draft to ${conversation.guest?.name ?? 'unknown guest'} (${conversation.guest?.email ?? 'no email'}) re: ${conversation.subject ?? '(no subject)'}`,
        payload: {
          conversationId: params.conversationId,
          draftId: params.draftId,
          ...(editedContent ? { content: editedContent } : {}),
        },
        createdAt: Date.now(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            actionId,
            message: editedContent
              ? `Ready to send the edited email to ${conversation.guest?.name ?? 'unknown'}. Reply OK to confirm sending or Cancel to discard.`
              : `Ready to send email to ${conversation.guest?.name ?? 'unknown'}. Reply OK to confirm sending or Cancel to discard.`,
          }, null, 2),
        }],
        details: {},
      };
    },
  });

  // ── 5. Regenerate Draft ────────────────────────────────

  api.registerTool({
    name: 'regenerate_draft',
    label: 'Regenerate Draft',
    description:
      'Regenerate an AI email draft. Rejects the current draft and queues a fresh AI-generated replacement. Use when Ines wants the email rewritten from scratch. Only works on drafts with status pending, rejected, or failed. No confirmation needed.',
    parameters: {
      type: 'object' as const,
      properties: {
        conversationId: { type: 'string', description: 'The conversation ID' },
        draftId: { type: 'string', description: 'The draft ID to regenerate' },
      },
      required: ['conversationId', 'draftId'],
    },
    async execute(_id: string, params: { conversationId: string; draftId: string }) {
      try {
        await client.post(`/api/v1/conversations/${params.conversationId}/drafts/${params.draftId}/regenerate`);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: 'Draft discarded and a new one is being generated. It will appear in pending drafts shortly.',
            }, null, 2),
          }],
          details: {},
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to regenerate draft';
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message,
            }, null, 2),
          }],
          details: {},
        };
      }
    },
  });

  // ── 6. Reject Draft ────────────────────────────────────

  api.registerTool({
    name: 'reject_draft',
    label: 'Reject Draft',
    description:
      'Reject an AI email draft. No confirmation needed for rejection -- it is discarded immediately.',
    parameters: {
      type: 'object' as const,
      properties: {
        conversationId: { type: 'string', description: 'The conversation ID' },
        draftId: { type: 'string', description: 'The draft ID to reject' },
      },
      required: ['conversationId', 'draftId'],
    },
    async execute(_id: string, params: { conversationId: string; draftId: string }) {
      await client.post(`/api/v1/conversations/${params.conversationId}/drafts/${params.draftId}/reject`);
      return {
        content: [{
          type: 'text' as const,
          text: 'Draft rejected.',
        }],
        details: {},
      };
    },
  });
}
