import 'zod-openapi/extend';
import { z } from 'zod';

// ─── Params ─────────────────────────────────────────────

export const conversationContextParamsSchema = z.object({
  conversationId: z.string().openapi({ example: 'cm4x7abc00030' }),
});

export const guestContextParamsSchema = z.object({
  guestId: z.string().openapi({ example: 'cm4x7abc00001' }),
});

// ─── Shared sub-schemas ─────────────────────────────────

const guestSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  language: z.string(),
  dietaryNeeds: z.string().nullable(),
  source: z.string().nullable(),
  tags: z.array(z.string()),
  notes: z.string().nullable(),
});

const bookingSummarySchema = z.object({
  id: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  status: z.string(),
  totalPrice: z.number(),
  source: z.string().nullable(),
  roomName: z.string(),
  roomTypeName: z.string(),
});

const messageSummarySchema = z.object({
  id: z.string(),
  direction: z.string(),
  content: z.string(),
  channel: z.string(),
  fromAddress: z.string().nullable(),
  fromName: z.string().nullable(),
  sentAt: z.string(),
});

const conversationSummarySchema = z.object({
  id: z.string(),
  channel: z.string(),
  subject: z.string().nullable(),
  status: z.string(),
  classification: z.string().nullable(),
  messageCount: z.number(),
  lastMessageAt: z.string().nullable(),
});

const availabilityItemSchema = z.object({
  roomTypeName: z.string(),
  totalRooms: z.number(),
  bookedRooms: z.number(),
  availableRooms: z.number(),
  dateRange: z.object({
    from: z.string(),
    to: z.string(),
  }),
});

const upcomingEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  date: z.string(),
  time: z.string(),
  capacity: z.number(),
  registeredCount: z.number(),
  remainingSlots: z.number(),
});

// ─── Response schemas ───────────────────────────────────

export const conversationContextResponseSchema = z.object({
  data: z.object({
    conversation: z.object({
      id: z.string(),
      channel: z.string(),
      subject: z.string().nullable(),
      status: z.string(),
      classification: z.string().nullable(),
      messages: z.array(messageSummarySchema),
    }),
    guest: guestSummarySchema.nullable(),
    bookings: z.array(bookingSummarySchema),
    availability: z.array(availabilityItemSchema),
    events: z.array(upcomingEventSchema),
  }),
});

export const guestContextResponseSchema = z.object({
  data: z.object({
    guest: guestSummarySchema,
    bookings: z.array(bookingSummarySchema),
    conversations: z.array(conversationSummarySchema),
  }),
});

export const availabilitySummaryResponseSchema = z.object({
  data: z.array(availabilityItemSchema),
});

export const upcomingEventsResponseSchema = z.object({
  data: z.array(upcomingEventSchema),
});
