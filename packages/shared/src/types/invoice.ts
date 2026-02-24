import type { InvoiceStatus } from '../constants/invoice-status.js';
import type { PaymentMethod } from '../constants/payment-method.js';

export interface Invoice {
  id: string;
  bookingId: string;
  guestId: string;
  invoiceNumber: string;
  amount: number;
  status: InvoiceStatus;
  paypalInvoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  invoiceId: string | null;
  bookingId: string | null;
  amount: number;
  method: PaymentMethod;
  notes: string | null;
  date: Date;
  deletedAt: Date | null;
  createdAt: Date;
}
