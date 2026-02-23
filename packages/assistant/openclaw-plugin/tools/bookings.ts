import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';
import { formatDate, formatEurCents, formatBookingStatus, formatNights, dashboardUrl } from '../lib/formatters.js';
import { storePendingAction } from '../lib/confirmation.js';

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
    parameters: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', description: 'Filter by status: inquiry, confirmed, checked_in, checked_out, cancelled' },
        from: { type: 'string', description: 'Start date filter (ISO format, e.g., 2026-03-01)' },
        to: { type: 'string', description: 'End date filter (ISO format, e.g., 2026-03-31)' },
        limit: { type: 'number', description: 'Max results (default 20)', default: 20 },
      },
      required: [],
    },
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
    parameters: {
      type: 'object' as const,
      properties: {
        bookingId: { type: 'string', description: 'The booking ID (UUID)' },
      },
      required: ['bookingId'],
    },
    async execute(_id: string, params: { bookingId: string }) {
      const data = await client.get<Booking>(`/api/v1/bookings/${params.bookingId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(formatBookingDetail(data as unknown as Booking), null, 2) }], details: {} };
    },
  });

  // ── 3. Prepare Update Booking ──────────────────────────

  api.registerTool({
    name: 'prepare_update_booking',
    label: 'Update Booking',
    description:
      'Prepare changes to an existing booking for confirmation. Shows a before/after diff of the fields being changed. Valid status transitions: inquiry -> confirmed -> checked_in -> checked_out (or cancelled from any state). Use when Ines asks to update a booking\'s room, dates, status, price, or notes.',
    parameters: {
      type: 'object' as const,
      properties: {
        bookingId: { type: 'string', description: 'The booking ID (UUID)' },
        roomId: { type: 'string', description: 'Updated room ID' },
        checkIn: { type: 'string', description: 'Updated check-in date (YYYY-MM-DD)' },
        checkOut: { type: 'string', description: 'Updated check-out date (YYYY-MM-DD)' },
        status: { type: 'string', description: 'Updated status: inquiry, confirmed, checked_in, checked_out, or cancelled' },
        totalPrice: { type: 'number', description: 'Updated total price in EUR cents (e.g., 45000 = EUR 450.00)' },
        source: { type: 'string', description: 'Updated booking source' },
        notes: { type: 'string', description: 'Updated notes' },
      },
      required: ['bookingId'],
    },
    async execute(
      _id: string,
      params: {
        bookingId: string;
        roomId?: string;
        checkIn?: string;
        checkOut?: string;
        status?: string;
        totalPrice?: number;
        source?: string;
        notes?: string;
      },
    ) {
      const current = await client.get<Booking>(`/api/v1/bookings/${params.bookingId}`);
      const b = current as unknown as Booking;

      // Build diff of changed fields
      const diff: Record<string, { from: unknown; to: unknown }> = {};
      const changes: Record<string, unknown> = {};

      if (params.roomId !== undefined && params.roomId !== b.room?.id) {
        diff['roomId'] = { from: b.room?.id ?? null, to: params.roomId };
        changes['roomId'] = params.roomId;
      }
      if (params.checkIn !== undefined && params.checkIn !== b.checkIn) {
        diff['checkIn'] = { from: formatDate(b.checkIn), to: formatDate(params.checkIn) };
        changes['checkIn'] = params.checkIn;
      }
      if (params.checkOut !== undefined && params.checkOut !== b.checkOut) {
        diff['checkOut'] = { from: formatDate(b.checkOut), to: formatDate(params.checkOut) };
        changes['checkOut'] = params.checkOut;
      }
      if (params.status !== undefined && params.status !== b.status) {
        diff['status'] = { from: formatBookingStatus(b.status), to: formatBookingStatus(params.status) };
        changes['status'] = params.status;
      }
      if (params.totalPrice !== undefined && params.totalPrice !== b.totalPrice) {
        diff['totalPrice'] = { from: formatEurCents(b.totalPrice), to: formatEurCents(params.totalPrice) };
        changes['totalPrice'] = params.totalPrice;
      }
      if (params.source !== undefined && params.source !== b.source) {
        diff['source'] = { from: b.source, to: params.source };
        changes['source'] = params.source;
      }
      if (params.notes !== undefined && params.notes !== b.notes) {
        diff['notes'] = { from: b.notes, to: params.notes };
        changes['notes'] = params.notes;
      }

      if (Object.keys(diff).length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              message: `No changes detected for booking ${b.id}. The provided values match the current booking.`,
            }, null, 2),
          }],
          details: {},
        };
      }

      const actionId = crypto.randomUUID();
      const nights = formatNights(
        params.checkIn ?? b.checkIn,
        params.checkOut ?? b.checkOut,
      );

      storePendingAction({
        id: actionId,
        type: 'update_booking',
        summary: `Update booking for ${b.guest?.name ?? 'unknown guest'}: ${Object.keys(diff).join(', ')}`,
        payload: { bookingId: params.bookingId, ...changes },
        createdAt: Date.now(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            actionId,
            booking: {
              guest: b.guest?.name,
              room: b.room?.name,
              nights,
            },
            changes: diff,
            instruction: 'Show Ines the before/after diff and ask her to reply OK to confirm or Cancel to reject.',
          }, null, 2),
        }],
        details: {},
      };
    },
  });

  // ── 4. Prepare Cancel Booking ──────────────────────────

  api.registerTool({
    name: 'prepare_cancel_booking',
    label: 'Cancel Booking',
    description:
      'Prepare to cancel a booking. Shows booking details for confirmation before cancelling. This updates the booking status to cancelled and triggers a calendar update. Use when Ines asks to cancel a booking.',
    parameters: {
      type: 'object' as const,
      properties: {
        bookingId: { type: 'string', description: 'The booking ID (UUID) to cancel' },
      },
      required: ['bookingId'],
    },
    async execute(_id: string, params: { bookingId: string }) {
      const current = await client.get<Booking>(`/api/v1/bookings/${params.bookingId}`);
      const b = current as unknown as Booking;

      const nights = formatNights(b.checkIn, b.checkOut);
      const actionId = crypto.randomUUID();

      storePendingAction({
        id: actionId,
        type: 'cancel_booking',
        summary: `Cancel booking for ${b.guest?.name ?? 'unknown guest'}: ${b.room?.name ?? 'unknown room'}, ${formatDate(b.checkIn)} - ${formatDate(b.checkOut)}`,
        payload: { bookingId: params.bookingId },
        createdAt: Date.now(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            actionId,
            summary: {
              action: 'Cancel booking',
              guest: b.guest?.name,
              guestEmail: b.guest?.email,
              room: b.room?.name,
              roomType: b.room?.roomType?.name,
              checkIn: formatDate(b.checkIn),
              checkOut: formatDate(b.checkOut),
              nights,
              totalPrice: formatEurCents(b.totalPrice),
              currentStatus: formatBookingStatus(b.status),
              warning: 'This will cancel the booking and update the calendar. The room will become available for new bookings.',
            },
            instruction: 'Present this summary and ask Ines to reply OK to confirm or Cancel to reject.',
          }, null, 2),
        }],
        details: {},
      };
    },
  });
}
