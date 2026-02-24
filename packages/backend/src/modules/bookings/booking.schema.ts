import 'zod-openapi/extend';
import { z } from 'zod';
import { paginationQuerySchema } from '@pyr/shared';

export const createBookingSchema = z.object({
  guestIds: z.array(z.string().min(1)).min(1).optional().openapi({ example: ['cm4x7abc00001'] }),
  guestId: z.string().min(1).optional().openapi({ example: 'cm4x7abc00001', description: 'Deprecated: use guestIds instead. Kept for backward compatibility.' }),
  roomId: z.string().min(1).openapi({ example: 'cm4x7abc00010' }),
  checkIn: z.string().date().openapi({ example: '2026-04-15' }),
  checkOut: z.string().date().openapi({ example: '2026-04-22' }),
  status: z.enum(['inquiry', 'confirmed']).default('inquiry').openapi({ example: 'confirmed' }),
  totalPrice: z.number().int().min(0).openapi({ example: 89500 }),
  source: z.string().max(100).nullish().openapi({ example: 'website' }),
  notes: z.string().max(5000).nullish().openapi({ example: 'Arrives late around 8pm. Vegan diet.' }),
}).refine(
  (data) => data.guestIds || data.guestId,
  { message: 'Either guestIds or guestId must be provided', path: ['guestIds'] },
);

export type CreateBookingBody = z.infer<typeof createBookingSchema>;

export const updateBookingSchema = z.object({
  guestIds: z.array(z.string().min(1)).min(1).optional().openapi({ example: ['cm4x7abc00001', 'cm4x7abc00002'] }),
  roomId: z.string().min(1).optional().openapi({ example: 'cm4x7abc00011' }),
  checkIn: z.string().date().optional().openapi({ example: '2026-04-16' }),
  checkOut: z.string().date().optional().openapi({ example: '2026-04-23' }),
  status: z.enum(['inquiry', 'confirmed', 'checked_in', 'checked_out', 'cancelled']).optional().openapi({ example: 'checked_in' }),
  totalPrice: z.number().int().min(0).optional().openapi({ example: 95000 }),
  source: z.string().max(100).nullish().openapi({ example: 'Tripaneer' }),
  notes: z.string().max(5000).nullish().openapi({ example: 'Upgraded to Deluxe Suite per guest request.' }),
});

export type UpdateBookingBody = z.infer<typeof updateBookingSchema>;

export const listBookingsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['inquiry', 'confirmed', 'checked_in', 'checked_out', 'cancelled']).optional().openapi({ example: 'confirmed' }),
  guestId: z.string().optional().openapi({ example: 'cm4x7abc00001' }),
  from: z.string().date().optional().openapi({ example: '2026-04-01' }),
  to: z.string().date().optional().openapi({ example: '2026-04-30' }),
});

export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
