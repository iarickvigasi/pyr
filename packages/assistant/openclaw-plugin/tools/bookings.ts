import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';
import { formatDate, formatEurCents, formatBookingStatus, dashboardUrl } from '../lib/formatters.js';

interface Booking {
  id: string;
  status: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  source: string | null;
  notes: string | null;
  guest?: { id: string; name: string; email: string | null };
  room?: { id: string; name: string; roomType?: { name: string } };
}

function formatBooking(b: Booking): Record<string, unknown> {
  return {
    id: b.id,
    guestName: b.guest?.name,
    guestEmail: b.guest?.email,
    room: b.room?.name,
    roomType: b.room?.roomType?.name,
    checkIn: formatDate(b.checkIn),
    checkOut: formatDate(b.checkOut),
    status: formatBookingStatus(b.status),
    totalPrice: formatEurCents(b.totalPrice),
    source: b.source,
    dashboardUrl: dashboardUrl(`/bookings/${b.id}`),
  };
}

function formatBookingDetail(b: Booking): Record<string, unknown> {
  return {
    ...formatBooking(b),
    notes: b.notes,
    guestId: b.guest?.id,
    guestDashboardUrl: b.guest ? dashboardUrl(`/guests/${b.guest.id}`) : null,
  };
}

export function registerBookingTools(api: OpenClawPluginApi, client: ApiClient): void {
  api.registerTool({
    name: 'list_bookings',
    label: 'List Bookings',
    description:
      'List bookings with optional filters. Filter by status (inquiry, confirmed, checked_in, checked_out, cancelled), or date range. Great for "show me upcoming bookings" or "who\'s checked in right now".',
    parameters: Type.Object({
      status: Type.Optional(Type.String({ description: 'Filter by status: inquiry, confirmed, checked_in, checked_out, cancelled' })),
      from: Type.Optional(Type.String({ description: 'Start date filter (ISO format, e.g., 2026-03-01)' })),
      to: Type.Optional(Type.String({ description: 'End date filter (ISO format, e.g., 2026-03-31)' })),
      limit: Type.Optional(Type.Number({ description: 'Max results (default 20)', default: 20 })),
    }),
    async execute(_id: string, params: { status?: string; from?: string; to?: string; limit?: number }) {
      const data = await client.get<Booking[]>('/api/v1/bookings', {
        status: params.status,
        from: params.from,
        to: params.to,
        limit: params.limit ?? 20,
      });
      const bookings = data as unknown as Booking[];
      const result = {
        bookings: bookings.map(formatBooking),
        totalReturned: bookings.length,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  });

  api.registerTool({
    name: 'get_booking',
    label: 'Get Booking Details',
    description:
      'Get full details of a specific booking including guest info, room assignment, and notes.',
    parameters: Type.Object({
      bookingId: Type.String({ description: 'The booking ID (UUID)' }),
    }),
    async execute(_id: string, params: { bookingId: string }) {
      const data = await client.get<Booking>(`/api/v1/bookings/${params.bookingId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(formatBookingDetail(data as unknown as Booking), null, 2) }], details: {} };
    },
  });
}
