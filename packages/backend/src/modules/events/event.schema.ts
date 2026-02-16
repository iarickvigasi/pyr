import { z } from 'zod';
import { paginationQuerySchema } from '@pyr/shared';

export const createEventSchema = z.object({
  type: z.enum(['puppy_yoga', 'beach_walk', 'coffee_cake_cuddles', 'retreat']),
  title: z.string().min(1).max(200),
  date: z.string().date(),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
  capacity: z.number().int().min(1),
  location: z.string().max(200).nullish(),
  description: z.string().max(2000).nullish(),
});

export type CreateEventBody = z.infer<typeof createEventSchema>;

export const updateEventSchema = z.object({
  type: z.enum(['puppy_yoga', 'beach_walk', 'coffee_cake_cuddles', 'retreat']).optional(),
  title: z.string().min(1).max(200).optional(),
  date: z.string().date().optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format').optional(),
  capacity: z.number().int().min(1).optional(),
  location: z.string().max(200).nullish(),
  description: z.string().max(2000).nullish(),
});

export type UpdateEventBody = z.infer<typeof updateEventSchema>;

export const listEventsQuerySchema = paginationQuerySchema.extend({
  type: z.enum(['puppy_yoga', 'beach_walk', 'coffee_cake_cuddles', 'retreat']).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;

export const registerGuestSchema = z.object({
  guestId: z.string().min(1),
});

export type RegisterGuestBody = z.infer<typeof registerGuestSchema>;
