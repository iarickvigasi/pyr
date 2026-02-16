export const PAYMENT_METHODS = [
  'paypal',
  'bank_transfer',
  'cash',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
