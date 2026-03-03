import 'zod-openapi/extend';
import { z } from 'zod';
import { paginationQuerySchema } from '@pyr/shared';
import {
  INBOX_CLASSIFICATIONS,
  INBOX_TAB_BUCKETS,
} from '../../services/email/inbox-classification.js';

export const createConversationSchema = z.object({
  guestId: z.string().min(1).openapi({ example: 'cm4x7abc00001' }),
  channel: z.enum(['email', 'whatsapp', 'instagram', 'telegram', 'gyg', 'viator', 'bookretreats', 'tripaneer']).openapi({ example: 'email' }),
  subject: z.string().max(500).nullish().openapi({ example: 'Inquiry about 7-day retreat in April' }),
});

export type CreateConversationBody = z.infer<typeof createConversationSchema>;

export const updateConversationSchema = z.object({
  status: z.enum(['open', 'closed']).optional().openapi({ example: 'closed' }),
  classification: z.enum(INBOX_CLASSIFICATIONS).optional().openapi({ example: 'conversation' }),
}).refine(data => data.status !== undefined || data.classification !== undefined, {
  message: 'At least one of status or classification must be provided',
});

export type UpdateConversationBody = z.infer<typeof updateConversationSchema>;

export const listConversationsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['open', 'closed']).optional().openapi({ example: 'open' }),
  guestId: z.string().optional().openapi({ example: 'cm4x7abc00001' }),
  bucket: z.enum(INBOX_TAB_BUCKETS).optional().openapi({ example: 'conversation_ota' }),
});

export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const addMessageSchema = z.object({
  direction: z.enum(['in', 'out']).openapi({ example: 'in' }),
  content: z.string().min(1).openapi({ example: 'Hi, I would like to book a 7-day retreat in April. Do you have availability?' }),
  channel: z.enum(['email', 'whatsapp', 'instagram', 'telegram', 'gyg', 'viator', 'bookretreats', 'tripaneer']).openapi({ example: 'email' }),
  messageId: z.string().nullish().openapi({ example: '<abc123@mail.example.com>' }),
  inReplyTo: z.string().nullish().openapi({ example: '<prev456@mail.example.com>' }),
  references: z.string().nullish().openapi({ example: '<prev456@mail.example.com> <orig789@mail.example.com>' }),
  sentAt: z.string().datetime().optional().openapi({ example: '2026-04-15T10:30:00Z' }),
});

export type AddMessageBody = z.infer<typeof addMessageSchema>;

export const replySchema = z.object({
  content: z.string().min(1).openapi({ example: 'Dear Anna, thank you for your interest! We have availability in April for the 7-day retreat.' }),
  html: z.string().optional().openapi({ example: '<p>Dear Anna, thank you for your interest!</p>' }),
});

export type ReplyBody = z.infer<typeof replySchema>;

export const unreadCountResponseSchema = z.object({
  data: z.object({ count: z.number() }),
});

export const attachmentParamsSchema = z.object({
  id: z.string().openapi({ example: 'cm4x7abc00030' }),
  messageId: z.string().openapi({ example: 'cm4x7abc00031' }),
  attachmentId: z.string().openapi({ example: 'cm4x7abc00032' }),
});

// ─── Draft Action Schemas ────────────────────────────────

export const draftActionParamsSchema = z.object({
  id: z.string().min(1).openapi({ example: 'cm4x7abc00030' }),
  draftId: z.string().min(1).openapi({ example: 'cm4x7abc00040' }),
});
export type DraftActionParams = z.infer<typeof draftActionParamsSchema>;

export const approveDraftBodySchema = z.object({
  content: z.string().optional().openapi({ example: 'Dear Anna, thank you for your inquiry! We have the Sunset Suite available from April 15-22.' }), // If edited, the modified content
});
export type ApproveDraftBody = z.infer<typeof approveDraftBodySchema>;

export const generateDraftParamsSchema = z.object({
  id: z.string().min(1).openapi({ example: 'cm4x7abc00030' }),
});

// ─── Customer Suggestion Schemas ───────────────────────────

export const customerSuggestionStatusSchema = z.enum([
  'linked',
  'matched_existing',
  'needs_create',
  'insufficient_data',
  'not_applicable',
]);

export const customerSuggestionDataSchema = z.object({
  status: customerSuggestionStatusSchema,
  classification: z.string().nullable(),
  reason: z.string(),
  matchedGuest: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
  }).nullable().optional(),
  candidate: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    shouldCreate: z.boolean(),
  }).nullable().optional(),
});

export const customerSuggestionSchema = z.object({
  data: customerSuggestionDataSchema,
});

export const linkConversationGuestBodySchema = z.object({
  guestId: z.string().min(1).openapi({ example: 'cm4x7abc00001' }),
});
export type LinkConversationGuestBody = z.infer<typeof linkConversationGuestBodySchema>;

export const createConversationGuestBodySchema = z.object({
  name: z.string().min(1).max(200).optional().openapi({ example: 'Anna Schmidt' }),
  email: z.string().email().optional().openapi({ example: 'anna@example.com' }),
  phone: z.string().min(3).max(60).optional().openapi({ example: '+49 170 1234567' }),
  language: z.enum(['en', 'de']).optional().openapi({ example: 'en' }),
});
export type CreateConversationGuestBody = z.infer<typeof createConversationGuestBodySchema>;

// ─── Booking Analysis + Creation Schemas ────────────────────

export const conversationBookingAnalysisStatusSchema = z.enum([
  'ready',
  'insufficient_data',
  'not_applicable',
  'error',
]);

export const conversationBookingMissingFieldSchema = z.enum([
  'checkIn',
  'checkOut',
]);

export const conversationBookingCandidateSchema = z.object({
  checkIn: z.string().date().nullable(),
  checkOut: z.string().date().nullable(),
  totalPrice: z.number().int().nullable(),
  currency: z.literal('EUR').nullable(),
  source: z.string().nullable(),
  notes: z.string().nullable(),
  guest: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  confidence: z.number().min(0).max(1).nullable(),
});

export const conversationBookingAnalysisDataSchema = z.object({
  status: conversationBookingAnalysisStatusSchema,
  reason: z.string(),
  classification: z.string().nullable(),
  missingFields: z.array(conversationBookingMissingFieldSchema),
  candidate: conversationBookingCandidateSchema.nullable(),
});

export const conversationBookingAnalysisResponseSchema = z.object({
  data: conversationBookingAnalysisDataSchema,
});

export const createConversationBookingBodySchema = z.object({
  guest: z.object({
    mode: z.enum(['linked', 'existing', 'create']),
    guestId: z.string().min(1).optional().openapi({ example: 'cm4x7abc00001' }),
    name: z.string().min(1).max(200).optional().openapi({ example: 'Anna Schmidt' }),
    email: z.string().email().optional().openapi({ example: 'anna@example.com' }),
    phone: z.string().min(3).max(60).optional().openapi({ example: '+49 170 1234567' }),
    language: z.enum(['en', 'de']).optional().openapi({ example: 'en' }),
  }).superRefine((data, ctx) => {
    if (data.mode === 'existing' && !data.guestId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['guestId'],
        message: 'guestId is required when mode is "existing"',
      });
    }
  }),
  booking: z.object({
    roomId: z.string().min(1).openapi({ example: 'cm4x7abc00010' }),
    checkIn: z.string().date().openapi({ example: '2026-04-15' }),
    checkOut: z.string().date().openapi({ example: '2026-04-22' }),
    totalPrice: z.number().int().min(0).openapi({ example: 89500 }),
    status: z.enum(['inquiry', 'confirmed']).optional().openapi({ example: 'inquiry' }),
    source: z.string().max(100).nullish().openapi({ example: 'tripaneer' }),
    notes: z.string().max(5000).nullish().openapi({ example: 'Created from inbox booking wizard' }),
  }),
});
export type CreateConversationBookingBody = z.infer<typeof createConversationBookingBodySchema>;
