import { z } from 'zod';

export const channelSchema = z.enum([
  'email',
  'whatsapp',
  'instagram',
  'telegram',
  'gyg',
  'viator',
  'bookretreats',
  'tripaneer',
]);

export const conversationMessageAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int(),
  contentId: z.string().nullable(),
});

export type ConversationMessageAttachment = z.infer<typeof conversationMessageAttachmentSchema>;

export const conversationMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  direction: z.enum(['in', 'out']),
  content: z.string(),
  channel: z.string(),
  htmlContent: z.string().nullable(),
  fromAddress: z.string().nullable(),
  fromName: z.string().nullable(),
  subject: z.string().nullable(),
  attachments: z.array(conversationMessageAttachmentSchema).optional(),
  sentAt: z.string(),
  createdAt: z.string(),
});

export type ConversationMessageDto = z.infer<typeof conversationMessageSchema>;

export const aiDraftSchema = z.object({
  id: z.string(),
  messageId: z.string().nullable(),
  conversationId: z.string(),
  content: z.string(),
  status: z.enum(['pending', 'approved', 'edited', 'rejected', 'failed']),
  model: z.string(),
  tokensUsed: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cacheReadTokens: z.number().int(),
  cacheWriteTokens: z.number().int(),
  costEur: z.number(),
  provider: z.string(),
  durationMs: z.number().int(),
  flags: z.array(z.string()),
  createdAt: z.string(),
});

export type AiDraftDto = z.infer<typeof aiDraftSchema>;

export const conversationSchema = z.object({
  id: z.string(),
  guestId: z.string().nullable(),
  channel: z.string(),
  subject: z.string().nullable(),
  status: z.string(),
  classification: z.string().nullable(),
  isRead: z.boolean(),
  messagePreview: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  guest: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    language: z.string().optional(),
  }).nullable(),
});

export type ConversationDto = z.infer<typeof conversationSchema>;

export const linkedBookingSchema = z.object({
  id: z.string(),
  status: z.string(),
  needsReview: z.boolean(),
});

export type LinkedBookingDto = z.infer<typeof linkedBookingSchema>;

export const linkedEventRegistrationSchema = z.object({
  id: z.string(),
  status: z.enum(['confirmed', 'waitlisted', 'cancelled']),
  attendeeCount: z.number().int(),
  sourceConversationId: z.string().nullable(),
  event: z.object({
    id: z.string(),
    title: z.string(),
    date: z.string(),
    time: z.string(),
    type: z.string(),
  }),
});

export type LinkedEventRegistrationDto = z.infer<typeof linkedEventRegistrationSchema>;

export const conversationWithMessagesSchema = conversationSchema.extend({
  messages: z.array(conversationMessageSchema),
  bookings: z.array(linkedBookingSchema).optional(),
  eventRegistrations: z.array(linkedEventRegistrationSchema).optional(),
});

export type ConversationWithMessagesDto = z.infer<typeof conversationWithMessagesSchema>;

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

export type CustomerSuggestionDto = z.infer<typeof customerSuggestionDataSchema>;

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

export type ConversationBookingAnalysisDto = z.infer<typeof conversationBookingAnalysisDataSchema>;

export const createConversationBookingBodySchema = z.object({
  guest: z.object({
    mode: z.enum(['linked', 'existing', 'create']),
    guestId: z.string().min(1).optional(),
    name: z.string().min(1).max(200).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(3).max(60).optional(),
    language: z.enum(['en', 'de']).optional(),
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
    roomId: z.string().min(1),
    checkIn: z.string().date(),
    checkOut: z.string().date(),
    totalPrice: z.number().int().min(0),
    status: z.enum(['inquiry', 'confirmed']).optional(),
    source: z.string().max(100).nullish(),
    notes: z.string().max(5000).nullish(),
  }),
});

export type CreateConversationBookingPayload = z.infer<typeof createConversationBookingBodySchema>;

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

export const eventTypeSchema = z.enum([
  'puppy_yoga',
  'beach_walk',
  'coffee_cake_cuddles',
  'retreat',
]);

export const conversationEventCandidateSchema = z.object({
  externalBookingId: z.string().nullable(),
  externalProductCode: z.string().nullable(),
  eventType: eventTypeSchema.nullable(),
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

export type ConversationEventAnalysisDto = z.infer<typeof conversationEventAnalysisDataSchema>;

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
  type: eventTypeSchema,
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

export type ConversationEventApplyPayload = z.infer<typeof applyConversationEventBodySchema>;
