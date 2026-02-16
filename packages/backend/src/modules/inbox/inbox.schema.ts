import { z } from 'zod';
import { paginationQuerySchema } from '@pyr/shared';

export const createConversationSchema = z.object({
  guestId: z.string().min(1),
  channel: z.enum(['email', 'whatsapp', 'instagram', 'telegram', 'gyg', 'viator', 'bookretreats', 'tripaneer']),
  subject: z.string().max(500).nullish(),
});

export type CreateConversationBody = z.infer<typeof createConversationSchema>;

export const updateConversationSchema = z.object({
  status: z.enum(['open', 'closed']),
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
