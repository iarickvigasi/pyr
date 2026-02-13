import type { Channel } from '../constants/channels.js';

export interface Conversation {
  id: string;
  guestId: string;
  channel: Channel;
  subject: string | null;
  status: 'open' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: 'in' | 'out';
  content: string;
  channel: Channel;
  sentAt: Date;
  createdAt: Date;
}

export interface AiDraft {
  id: string;
  messageId: string;
  content: string;
  status: 'pending' | 'approved' | 'edited' | 'rejected';
  model: string;
  tokensUsed: number;
  createdAt: Date;
  updatedAt: Date;
}
