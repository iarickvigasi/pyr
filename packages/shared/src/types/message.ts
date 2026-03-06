import type { Channel } from '../constants/channels.js';
import type { ConversationStatus } from '../constants/conversation-status.js';
import type { AiDraftStatus } from '../constants/ai-draft-status.js';

export interface Conversation {
  id: string;
  guestId: string | null;
  channel: Channel;
  subject: string | null;
  status: ConversationStatus;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: 'in' | 'out';
  content: string;
  channel: Channel;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  sentAt: Date;
  createdAt: Date;
}

export interface AiDraft {
  id: string;
  conversationId: string;
  messageId: string | null;
  content: string;
  status: AiDraftStatus;
  model: string;
  tokensUsed: number;
  createdAt: Date;
  updatedAt: Date;
}
