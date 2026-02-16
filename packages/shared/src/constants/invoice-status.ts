export const INVOICE_STATUSES = [
  'draft',
  'sent',
  'paid',
  'cancelled',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
