import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';
import { formatDateTime, dashboardUrl } from '../lib/formatters.js';

interface Conversation {
  id: string;
  subject: string | null;
  channel: string;
  status: string;
  classification: string | null;
  guest?: { id: string; name: string; email: string | null };
  messages?: Message[];
  _count?: { messages: number };
  updatedAt: string;
}

interface Message {
  id: string;
  direction: string;
  content: string;
  channel: string;
  sentAt: string;
}

function formatConversation(c: Conversation): Record<string, unknown> {
  const lastMessage = c.messages?.[0];
  return {
    id: c.id,
    guestName: c.guest?.name ?? 'Unknown',
    guestEmail: c.guest?.email,
    subject: c.subject,
    channel: c.channel,
    status: c.status,
    classification: c.classification,
    messageCount: c._count?.messages ?? c.messages?.length ?? 0,
    lastMessage: lastMessage ? {
      direction: lastMessage.direction,
      preview: lastMessage.content.length > 150 ? lastMessage.content.slice(0, 150) + '...' : lastMessage.content,
      sentAt: formatDateTime(lastMessage.sentAt),
    } : null,
    lastActivity: formatDateTime(c.updatedAt),
    dashboardUrl: dashboardUrl(`/conversations/${c.id}`),
  };
}

function formatConversationDetail(c: Conversation): Record<string, unknown> {
  return {
    id: c.id,
    guestName: c.guest?.name ?? 'Unknown',
    guestEmail: c.guest?.email,
    guestDashboardUrl: c.guest ? dashboardUrl(`/guests/${c.guest.id}`) : null,
    subject: c.subject,
    channel: c.channel,
    status: c.status,
    classification: c.classification,
    messages: c.messages?.map(m => ({
      direction: m.direction,
      content: m.content,
      sentAt: formatDateTime(m.sentAt),
    })),
    dashboardUrl: dashboardUrl(`/conversations/${c.id}`),
  };
}

export function registerConversationTools(api: OpenClawPluginApi, client: ApiClient): void {
  api.registerTool({
    name: 'list_conversations',
    label: 'List Conversations',
    description:
      'List email conversations (inbox). Can filter by status (open, closed, archived). Shows guest name, subject, and a preview of the latest message. Use for "any new messages?" or "show me open conversations".',
    parameters: Type.Object({
      status: Type.Optional(Type.String({ description: 'Filter by status: open, closed, archived' })),
      limit: Type.Optional(Type.Number({ description: 'Max results (default 20)', default: 20 })),
    }),
    async execute(_id: string, params: { status?: string; limit?: number }) {
      const data = await client.get<Conversation[]>('/api/v1/conversations', {
        status: params.status,
        limit: params.limit ?? 20,
      });
      const conversations = data as unknown as Conversation[];
      const result = {
        conversations: conversations.map(formatConversation),
        totalReturned: conversations.length,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  });

  api.registerTool({
    name: 'get_conversation',
    label: 'Get Conversation Details',
    description:
      'Get a specific conversation with its full message thread. Shows all messages exchanged with the guest in chronological order.',
    parameters: Type.Object({
      conversationId: Type.String({ description: 'The conversation ID (UUID)' }),
    }),
    async execute(_id: string, params: { conversationId: string }) {
      const data = await client.get<Conversation>(`/api/v1/conversations/${params.conversationId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(formatConversationDetail(data as unknown as Conversation), null, 2) }], details: {} };
    },
  });
}
