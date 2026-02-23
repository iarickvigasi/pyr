import 'zod-openapi/extend';
import { z } from 'zod';
import { paginationQuerySchema } from '@pyr/shared';

export const createEventSchema = z.object({
  type: z.enum(['puppy_yoga', 'beach_walk', 'coffee_cake_cuddles', 'retreat']).openapi({ example: 'puppy_yoga' }),
  title: z.string().min(1).max(200).openapi({ example: 'Rooftop Puppy Yoga' }),
  date: z.string().date().openapi({ example: '2026-04-18' }),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:MM format (00:00–23:59)').openapi({ example: '10:00' }),
  capacity: z.number().int().min(1).openapi({ example: 8 }),
  location: z.string().max(200).nullish().openapi({ example: 'Rooftop Terrace' }),
  description: z.string().max(2000).nullish().openapi({ example: '90-minute yoga session with rescued puppies on our rooftop terrace overlooking the Mediterranean.' }),
});

export type CreateEventBody = z.infer<typeof createEventSchema>;

export const updateEventSchema = z.object({
  type: z.enum(['puppy_yoga', 'beach_walk', 'coffee_cake_cuddles', 'retreat']).optional().openapi({ example: 'beach_walk' }),
  title: z.string().min(1).max(200).optional().openapi({ example: 'Sunset Puppy Beach Walk' }),
  date: z.string().date().optional().openapi({ example: '2026-04-19' }),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:MM format (00:00–23:59)').optional().openapi({ example: '17:30' }),
  capacity: z.number().int().min(1).optional().openapi({ example: 12 }),
  location: z.string().max(200).nullish().openapi({ example: 'Coral Bay Beach' }),
  description: z.string().max(2000).nullish().openapi({ example: 'Leisurely beach walk with our rescue puppies at sunset.' }),
});

export type UpdateEventBody = z.infer<typeof updateEventSchema>;

export const listEventsQuerySchema = paginationQuerySchema.extend({
  type: z.enum(['puppy_yoga', 'beach_walk', 'coffee_cake_cuddles', 'retreat']).optional().openapi({ example: 'puppy_yoga' }),
  from: z.string().date().optional().openapi({ example: '2026-04-01' }),
  to: z.string().date().optional().openapi({ example: '2026-04-30' }),
});

export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;

export const registerGuestSchema = z.object({
  guestId: z.string().min(1).openapi({ example: 'cm4x7abc00001' }),
});

export type RegisterGuestBody = z.infer<typeof registerGuestSchema>;
