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
}).nullable().optional();
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

// ─── Event Analysis + Actions Schemas ───────────────────────

export const conversationEventAnalysisStatusSchema = z.enum([
  'pending',
  'ready',
  'insufficient_data',
  'not_applicable',
  'error',
]);

export const conversationEventIntentSchema = z.enum([
  'create_or_link',
  'cancel',
  'move',
]).nullable();

export const conversationEventMissingFieldSchema = z.enum([
  'externalBookingId',
  'eventDate',
  'eventTime',
]);

export const conversationEventCandidateSchema = z.object({
  externalBookingId: z.string().nullable(),
  externalProductCode: z.string().nullable(),
  eventType: z.enum(['puppy_yoga', 'beach_walk', 'coffee_cake_cuddles', 'retreat']).nullable(),
  eventTitle: z.string().nullable(),
  eventDate: z.string().date().nullable(),
  eventTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  location: z.string().nullable(),
  attendeeCount: z.number().int().min(1).nullable(),
  guest: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  confidence: z.number().min(0).max(1).nullable(),
}).nullable();

export const conversationEventResolutionSchema = z.object({
  matchedGuestId: z.string().nullable(),
  matchedEventId: z.string().nullable(),
  matchedEventBookingId: z.string().nullable(),
  recommendedOperation: z.enum(['create_or_link', 'cancel', 'move', 'none']),
  guestFieldDiffs: z.object({
    name: z.object({ current: z.string().nullable(), proposed: z.string().nullable() }),
    email: z.object({ current: z.string().nullable(), proposed: z.string().nullable() }),
    phone: z.object({ current: z.string().nullable(), proposed: z.string().nullable() }),
  }),
}).nullable();

export const conversationEventAnalysisDataSchema = z.object({
  status: conversationEventAnalysisStatusSchema,
  provider: z.string(),
  reason: z.string(),
  classification: z.string().nullable(),
  intent: conversationEventIntentSchema,
  missingFields: z.array(conversationEventMissingFieldSchema),
  candidate: conversationEventCandidateSchema,
  resolution: conversationEventResolutionSchema,
  messageId: z.string().nullable(),
});

export const conversationEventAnalysisResponseSchema = z.object({
  data: conversationEventAnalysisDataSchema,
});

const eventGuestPayloadSchema = z.object({
  mode: z.enum(['linked', 'existing', 'create']),
  guestId: z.string().min(1).optional(),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(3).max(60).optional(),
  language: z.enum(['en', 'de']).optional(),
  applyUpdates: z.object({
    name: z.boolean().optional(),
    email: z.boolean().optional(),
    phone: z.boolean().optional(),
  }).optional(),
}).superRefine((data, ctx) => {
  if (data.mode === 'existing' && !data.guestId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['guestId'],
      message: 'guestId is required when mode is "existing"',
    });
  }
});

const existingEventTargetSchema = z.object({
  mode: z.literal('existing'),
  eventId: z.string().min(1),
});

const createEventTargetSchema = z.object({
  mode: z.literal('create'),
  type: z.enum(['puppy_yoga', 'beach_walk', 'coffee_cake_cuddles', 'retreat']),
  title: z.string().min(1).max(200),
  date: z.string().date(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  capacity: z.number().int().min(1),
  location: z.string().max(200).nullish(),
  description: z.string().max(2000).nullish(),
});

const eventTargetSchema = z.discriminatedUnion('mode', [
  existingEventTargetSchema,
  createEventTargetSchema,
]);

export const applyConversationEventBodySchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('create_or_link'),
    guest: eventGuestPayloadSchema,
    event: eventTargetSchema,
    registration: z.object({
      externalBookingId: z.string().min(1),
      externalProductCode: z.string().max(200).nullish(),
      attendeeCount: z.number().int().min(1).optional(),
    }),
  }),
  z.object({
    operation: z.literal('cancel'),
    externalBookingId: z.string().min(1),
  }),
  z.object({
    operation: z.literal('move'),
    externalBookingId: z.string().min(1),
    targetEvent: eventTargetSchema,
  }),
]);
export type ApplyConversationEventBody = z.infer<typeof applyConversationEventBodySchema>;
