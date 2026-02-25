import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';
import { formatDate, formatEurCents, formatPaymentStatus, dashboardUrl } from '../lib/formatters.js';
import { storePendingAction } from '../lib/confirmation.js';

// ─── Types from API responses ────────────────────────────

interface BookingDetail {
  id: string;
  status: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  bookingGuests?: Array<{ guest: { id: string; name: string; email: string | null } }>;
  guest?: { id: string; name: string; email: string | null };
  room?: { id: string; name: string; roomType?: { name: string } };
  paymentSummary?: { totalPrice: number; totalPaid: number; balanceDue: number };
  payments?: Array<{ id: string; date: string; amount: number; method: string; notes: string | null }>;
}

function getGuestNames(b: BookingDetail): string[] {
  return b.bookingGuests?.length
    ? b.bookingGuests.map(bg => bg.guest.name)
    : b.guest ? [b.guest.name] : [];
}

// ─── Tool Registration ───────────────────────────────────

export function registerPaymentTools(api: OpenClawPluginApi, client: ApiClient): void {
  // ── 1. Get Payment Status ──────────────────────────────

  api.registerTool({
    name: 'get_payment_status',
    label: 'Get Payment Status',
    description:
      'Get payment balance for a booking: total price, amount paid, balance due, and payment history. Use for "what\'s the payment status for booking X?" or "how much does X owe?".',
    parameters: {
      type: 'object' as const,
      properties: {
        bookingId: { type: 'string', description: 'Booking ID to check payment status for' },
      },
      required: ['bookingId'],
    },
    async execute(_id: string, params: { bookingId: string }) {
      const booking = await client.get<BookingDetail>(`/api/v1/bookings/${params.bookingId}`);
      const b = booking as unknown as BookingDetail;

      const guestNames = getGuestNames(b).join(', ') || 'Unknown';
      const summary = b.paymentSummary ?? { totalPrice: b.totalPrice, totalPaid: 0, balanceDue: b.totalPrice };
      const status = summary.balanceDue === 0 ? 'paid' : summary.totalPaid > 0 ? 'partial' : 'unpaid';

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            booking: {
              id: b.id,
              guests: guestNames,
              room: b.room ? `${b.room.name}${b.room.roomType ? ` (${b.room.roomType.name})` : ''}` : null,
              checkIn: formatDate(b.checkIn),
              checkOut: formatDate(b.checkOut),
              dashboardUrl: dashboardUrl(`/bookings/${b.id}`),
            },
            paymentStatus: formatPaymentStatus(status),
            totalPrice: formatEurCents(summary.totalPrice),
            totalPaid: formatEurCents(summary.totalPaid),
            balanceDue: formatEurCents(summary.balanceDue),
            payments: (b.payments ?? []).map(p => ({
              id: p.id,
              date: formatDate(p.date),
              amount: formatEurCents(p.amount),
              method: p.method,
              notes: p.notes,
            })),
          }, null, 2),
        }],
        details: {},
      };
    },
  });

  // ── 2. Prepare Log Payment ─────────────────────────────

  api.registerTool({
    name: 'prepare_log_payment',
    label: 'Prepare Log Payment',
    description:
      'Log a payment against a booking with amount in EUR, method, and optional date/notes. Uses two-step confirmation -- presents a summary for Ines to approve before executing.',
    parameters: {
      type: 'object' as const,
      properties: {
        bookingId: { type: 'string', description: 'Booking ID to log payment for' },
        amount: { type: 'number', description: 'Amount in EUR (e.g., 500 for EUR 500.00). Will be converted to cents internally.' },
        method: { type: 'string', description: 'Payment method: bank_transfer or cash' },
        date: { type: 'string', description: 'Payment date (YYYY-MM-DD). Defaults to today.' },
        notes: { type: 'string', description: 'Optional notes about the payment' },
      },
      required: ['bookingId', 'amount', 'method'],
    },
    async execute(
      _id: string,
      params: {
        bookingId: string;
        amount: number;
        method: string;
        date?: string;
        notes?: string;
      },
    ) {
      // Validate method
      const validMethods = ['bank_transfer', 'cash'];
      if (!validMethods.includes(params.method)) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: `Invalid payment method "${params.method}". Must be one of: ${validMethods.join(', ')}.`,
            }, null, 2),
          }],
          details: {},
        };
      }

      // Fetch current booking for context
      const booking = await client.get<BookingDetail>(`/api/v1/bookings/${params.bookingId}`);
      const b = booking as unknown as BookingDetail;

      const guestNames = getGuestNames(b).join(', ') || 'Unknown';
      const amountCents = Math.round(params.amount * 100);
      const summary = b.paymentSummary ?? { totalPrice: b.totalPrice, totalPaid: 0, balanceDue: b.totalPrice };
      const newBalanceDue = summary.balanceDue - amountCents;

      const actionId = crypto.randomUUID();

      storePendingAction({
        id: actionId,
        type: 'log_payment',
        summary: `Log ${formatEurCents(amountCents)} ${params.method.replace('_', ' ')} for booking (${guestNames})`,
        payload: {
          bookingId: params.bookingId,
          amount: amountCents,
          method: params.method,
          date: params.date ?? null,
          notes: params.notes ?? null,
        },
        createdAt: Date.now(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            actionId,
            summary: {
              booking: {
                id: b.id,
                guests: guestNames,
                checkIn: formatDate(b.checkIn),
                checkOut: formatDate(b.checkOut),
              },
              payment: {
                amount: formatEurCents(amountCents),
                method: params.method.replace('_', ' '),
                date: params.date ? formatDate(params.date) : 'Today',
                notes: params.notes ?? null,
              },
              balanceBefore: formatEurCents(summary.balanceDue),
              balanceAfter: formatEurCents(Math.max(0, newBalanceDue)),
            },
            instruction: 'Present this as a structured summary and ask Ines to reply OK to confirm or Cancel to reject.',
          }, null, 2),
        }],
        details: {},
      };
    },
  });
}
