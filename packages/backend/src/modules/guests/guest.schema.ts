import { z } from 'zod';
import { paginationQuerySchema } from '@pyr/shared';

export const createGuestSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().nullish(),
  phone: z.string().max(50).nullish(),
  language: z.enum(['en', 'de']).default('en'),
  dietaryNeeds: z.string().max(500).nullish(),
  source: z.string().max(100).nullish(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  notes: z.string().max(5000).nullish(),
});

export type CreateGuestBody = z.infer<typeof createGuestSchema>;

export const updateGuestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().nullish(),
  phone: z.string().max(50).nullish(),
  language: z.enum(['en', 'de']).optional(),
  dietaryNeeds: z.string().max(500).nullish(),
  source: z.string().max(100).nullish(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  notes: z.string().max(5000).nullish(),
});

export type UpdateGuestBody = z.infer<typeof updateGuestSchema>;

export const listGuestsQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
  tag: z.string().optional(),
  source: z.string().optional(),
  language: z.enum(['en', 'de']).optional(),
});

export type ListGuestsQuery = z.infer<typeof listGuestsQuerySchema>;

export const mergeGuestsSchema = z.object({
  primaryId: z.string().min(1),
  secondaryId: z.string().min(1),
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
