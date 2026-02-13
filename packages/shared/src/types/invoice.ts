export interface Invoice {
  id: string;
  bookingId: string;
  guestId: string;
  amount: number;
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  paypalInvoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: 'paypal' | 'bank_transfer' | 'cash';
  receivedAt: Date;
  createdAt: Date;
}
