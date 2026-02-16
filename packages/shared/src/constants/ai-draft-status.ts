export const AI_DRAFT_STATUSES = [
  'pending',
  'approved',
  'edited',
  'rejected',
] as const;

export type AiDraftStatus = (typeof AI_DRAFT_STATUSES)[number];
