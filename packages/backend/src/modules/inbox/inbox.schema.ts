import { z } from 'zod';
import { paginationQuerySchema } from '@pyr/shared';

export const createConversationSchema = z.object({
  guestId: z.string().min(1),
  channel: z.enum(['email', 'whatsapp', 'instagram', 'telegram', 'gyg', 'viator', 'bookretreats', 'tripaneer']),
  subject: z.string().max(500).nullish(),
});

export type CreateConversationBody = z.infer<typeof createConversationSchema>;

export const updateConversationSchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
  classification: z.enum(['guest_inquiry', 'ota_notification', 'spam_newsletter', 'admin_system']).optional(),
}).refine(data => data.status !== undefined || data.classification !== undefined, {
  message: 'At least one of status or classification must be provided',
});

export type UpdateConversationBody = z.infer<typeof updateConversationSchema>;

export const listConversationsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['open', 'closed']).optional(),
  guestId: z.string().optional(),
});

export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const addMessageSchema = z.object({
  direction: z.enum(['in', 'out']),
  content: z.string().min(1),
  channel: z.enum(['email', 'whatsapp', 'instagram', 'telegram', 'gyg', 'viator', 'bookretreats', 'tripaneer']),
  messageId: z.string().nullish(),
  inReplyTo: z.string().nullish(),
  references: z.string().nullish(),
  sentAt: z.string().datetime().optional(),
});

export type AddMessageBody = z.infer<typeof addMessageSchema>;

export const replySchema = z.object({
  content: z.string().min(1),
  html: z.string().optional(),
});

export type ReplyBody = z.infer<typeof replySchema>;

export const unreadCountResponseSchema = z.object({
  data: z.object({ count: z.number() }),
});

export const attachmentParamsSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  attachmentId: z.string(),
});

// ─── Draft Action Schemas ────────────────────────────────

export const draftActionParamsSchema = z.object({
  id: z.string().min(1),
  draftId: z.string().min(1),
});
export type DraftActionParams = z.infer<typeof draftActionParamsSchema>;

export const approveDraftBodySchema = z.object({
  content: z.string().optional(), // If edited, the modified content
});
export type ApproveDraftBody = z.infer<typeof approveDraftBodySchema>;
