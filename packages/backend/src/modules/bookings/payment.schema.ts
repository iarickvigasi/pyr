import 'zod-openapi/extend';
import { z } from 'zod';

export const createPaymentSchema = z.object({
  amount: z.number().int().min(1).openapi({ example: 45000, description: 'Payment amount in EUR cents' }),
  method: z.enum(['bank_transfer', 'cash']).openapi({ example: 'bank_transfer' }),
  date: z.string().date().optional().openapi({ example: '2026-03-15', description: 'Payment date (defaults to today)' }),
  notes: z.string().max(1000).nullish().openapi({ example: 'SEPA transfer ref: PYR-2026-0042' }),
});

export type CreatePaymentBody = z.infer<typeof createPaymentSchema>;

export const bookingPaymentParamSchema = z.object({
  id: z.string().min(1),
  paymentId: z.string().min(1),
});

export type BookingPaymentParam = z.infer<typeof bookingPaymentParamSchema>;
