import { z } from 'zod';

const ymdDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format');

export const motopressBookingStatusSchema = z.enum([
  'pending-user',
  'pending-payment',
  'pending',
  'abandoned',
  'confirmed',
  'cancelled',
]);

export const motopressCustomerSchema = z.object({
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
}).passthrough();

export const motopressReservedAccommodationSchema = z.object({
  accommodation: z.number().int().positive(),
  adults: z.number().int().min(1),
  children: z.number().int().min(0).optional(),
  guest_name: z.string().nullish(),
}).passthrough();

export const motopressBookingUpsertPayloadSchema = z.object({
  status: motopressBookingStatusSchema.optional(),
  check_in_date: ymdDateSchema,
  check_out_date: ymdDateSchema,
  customer: motopressCustomerSchema.optional(),
  reserved_accommodations: z.array(motopressReservedAccommodationSchema).min(1),
  note: z.string().optional(),
});

export const motopressBookingSchema = z.object({
  id: z.number().int().positive(),
  status: motopressBookingStatusSchema,
  check_in_date: ymdDateSchema,
  check_out_date: ymdDateSchema,
  customer: motopressCustomerSchema.nullish(),
  total_price: z.number().nullish(),
  date_modified_utc: z.string().datetime().nullish(),
}).passthrough();

export const motopressBookingCollectionSchema = z.array(motopressBookingSchema);

export const motopressAccommodationSchema = z.object({
  id: z.number().int().positive(),
  status: z.string(),
  accommodation_type_id: z.number().int().positive().nullish(),
  title: z.string(),
}).passthrough();

export const motopressAccommodationCollectionSchema = z.array(motopressAccommodationSchema);

export const motopressAccommodationTypeSchema = z.object({
  id: z.number().int().positive(),
  status: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  excerpt: z.string().nullish(),
  adults: z.number().int().nullish(),
  children: z.number().int().nullish(),
  total_capacity: z.number().int().nullish(),
  base_adults: z.number().int().nullish(),
  base_children: z.number().int().nullish(),
}).passthrough();

export const motopressAccommodationTypeCollectionSchema = z.array(motopressAccommodationTypeSchema);

export type MotopressBooking = z.infer<typeof motopressBookingSchema>;
export type MotopressBookingUpsertPayload = z.infer<typeof motopressBookingUpsertPayloadSchema>;
export type MotopressAccommodation = z.infer<typeof motopressAccommodationSchema>;
export type MotopressAccommodationType = z.infer<typeof motopressAccommodationTypeSchema>;
