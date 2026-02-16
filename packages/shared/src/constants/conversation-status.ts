export const CONVERSATION_STATUSES = [
  'open',
  'closed',
] as const;

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
