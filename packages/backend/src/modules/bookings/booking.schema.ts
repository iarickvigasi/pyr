import { z } from 'zod';
import { paginationQuerySchema } from '@pyr/shared';

export const createBookingSchema = z.object({
  guestId: z.string().min(1),
  roomId: z.string().min(1),
  checkIn: z.string().date(),
  checkOut: z.string().date(),
  status: z.enum(['inquiry', 'confirmed', 'checked_in', 'checked_out', 'cancelled']).default('inquiry'),
  totalPrice: z.number().int().min(0),
  source: z.string().max(100).nullish(),
  notes: z.string().max(5000).nullish(),
});

export type CreateBookingBody = z.infer<typeof createBookingSchema>;

export const updateBookingSchema = z.object({
  roomId: z.string().min(1).optional(),
  checkIn: z.string().date().optional(),
  checkOut: z.string().date().optional(),
  status: z.enum(['inquiry', 'confirmed', 'checked_in', 'checked_out', 'cancelled']).optional(),
  totalPrice: z.number().int().min(0).optional(),
  source: z.string().max(100).nullish(),
  notes: z.string().max(5000).nullish(),
});

export type UpdateBookingBody = z.infer<typeof updateBookingSchema>;

export const listBookingsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['inquiry', 'confirmed', 'checked_in', 'checked_out', 'cancelled']).optional(),
  guestId: z.string().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
