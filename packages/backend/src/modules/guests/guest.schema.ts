import 'zod-openapi/extend';
import { z } from 'zod';
import { paginationQuerySchema } from '@pyr/shared';

export const createGuestSchema = z.object({
  name: z.string().min(1).max(200).openapi({ example: 'Anna Schmidt' }),
  email: z.string().email().nullish().openapi({ example: 'anna.schmidt@example.com' }),
  phone: z.string().max(50).nullish().openapi({ example: '+49 176 1234567' }),
  language: z.enum(['en', 'de']).default('en').openapi({ example: 'de' }),
  dietaryNeeds: z.string().max(500).nullish().openapi({ example: 'Vegan, gluten-free' }),
  source: z.string().max(100).nullish().openapi({ example: 'website' }),
  tags: z.array(z.string().max(50)).max(20).default([]).openapi({ example: ['VIP', 'returning'] }),
  notes: z.string().max(5000).nullish().openapi({ example: 'Interested in the 7-day retreat package with private yoga sessions.' }),
}).refine(
  (data) => data.email || data.phone,
  { message: 'At least one of email or phone is required', path: ['email'] },
);

export type CreateGuestBody = z.infer<typeof createGuestSchema>;

export const updateGuestSchema = z.object({
  name: z.string().min(1).max(200).optional().openapi({ example: 'Anna Schmidt-Mueller' }),
  email: z.string().email().nullish().openapi({ example: 'anna.mueller@example.com' }),
  phone: z.string().max(50).nullish().openapi({ example: '+357 99 123456' }),
  language: z.enum(['en', 'de']).optional().openapi({ example: 'en' }),
  dietaryNeeds: z.string().max(500).nullish().openapi({ example: 'Vegetarian' }),
  source: z.string().max(100).nullish().openapi({ example: 'Tripaneer' }),
  tags: z.array(z.string().max(50)).max(20).optional().openapi({ example: ['VIP'] }),
  notes: z.string().max(5000).nullish().openapi({ example: 'Updated contact details after booking confirmation.' }),
});

export type UpdateGuestBody = z.infer<typeof updateGuestSchema>;

export const listGuestsQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional().openapi({ example: 'Anna' }),
  tag: z.string().optional().openapi({ example: 'VIP' }),
  source: z.string().optional().openapi({ example: 'website' }),
  language: z.enum(['en', 'de']).optional().openapi({ example: 'de' }),
});

export type ListGuestsQuery = z.infer<typeof listGuestsQuerySchema>;

export const mergeGuestsSchema = z.object({
  primaryId: z.string().min(1).openapi({ example: 'cm4x7abc00001' }),
  secondaryId: z.string().min(1).openapi({ example: 'cm4x7abc00002' }),
});

export type MergeGuestsBody = z.infer<typeof mergeGuestsSchema>;

export const guestResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  language: z.string(),
  dietaryNeeds: z.string().nullable(),
  source: z.string().nullable(),
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const guestDetailResponseSchema = guestResponseSchema.extend({
  _count: z.object({
    bookings: z.number(),
    conversations: z.number(),
    eventBookings: z.number(),
  }),
});
