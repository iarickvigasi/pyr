import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';
import {
  storePendingAction,
  getPendingAction,
  removePendingAction,
  cleanupStaleActions,
} from '../lib/confirmation.js';
import { formatDate, formatEurCents, formatEventType, formatPaymentStatus, formatNights, dashboardUrl } from '../lib/formatters.js';

// ─── Types from API responses ────────────────────────────

interface Guest {
  id: string;
  name: string;
  email: string | null;
}

interface AvailabilityRoom {
  roomId: string;
  roomName: string;
  room: { id: string; name: string };
  roomTypeName: string;
  roomType: { id: string; name: string; basePrice: number; maxOccupancy: number };
  nights: number;
  totalPrice: number;
}

interface Booking {
  id: string;
  status: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  guest?: { id: string; name: string; email: string | null };
  bookingGuests?: Array<{ guest: { id: string; name: string; email: string | null } }>;
  paymentStatus?: string;
  paymentSummary?: { totalPrice: number; totalPaid: number; balanceDue: number };
  room?: { id: string; name: string; roomType?: { name: string } };
}

function getGuestNames(b: Booking): string[] {
  return b.bookingGuests?.length
    ? b.bookingGuests.map(bg => bg.guest.name)
    : b.guest ? [b.guest.name] : [];
}

// ─── Tool Registration ───────────────────────────────────

export function registerActionTools(api: OpenClawPluginApi, client: ApiClient): void {
  // ── 1. Prepare Create Booking ──────────────────────────

  api.registerTool({
    name: 'prepare_create_booking',
    label: 'Prepare Booking',
    description:
      'Prepare a new booking for confirmation. Searches for guest(s) by name, checks room availability, calculates price, and returns a summary for Ines to review before creating. Supports multiple guests (comma-separated). NEVER execute a booking without showing the summary first.',
    parameters: {
      type: 'object' as const,
      properties: {
        guestNames: { type: 'string', description: 'Guest name(s) to search for, comma-separated (e.g., "Anna Schmidt, Max Muller")' },
        roomType: { type: 'string', description: 'Room type preference (e.g., Suite, Standard). Optional -- picks first available if not specified.' },
        checkIn: { type: 'string', description: 'Check-in date (YYYY-MM-DD)' },
        checkOut: { type: 'string', description: 'Check-out date (YYYY-MM-DD)' },
        status: { type: 'string', description: 'Booking status: inquiry or confirmed (default: confirmed)' },
        notes: { type: 'string', description: 'Optional notes for the booking' },
      },
      required: ['guestNames', 'checkIn', 'checkOut'],
    },
    async execute(
      _id: string,
      params: {
        guestNames: string;
        roomType?: string;
        checkIn: string;
        checkOut: string;
        status?: string;
        notes?: string;
      },
    ) {
      // 1. Resolve guest names
      const names = params.guestNames.split(',').map(n => n.trim()).filter(Boolean);
      if (names.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: 'No guest names provided. Please specify at least one guest name.',
            }, null, 2),
          }],
          details: {},
        };
      }

      const resolved: Guest[] = [];
      const notFound: string[] = [];
      const disambiguationNotes: string[] = [];

      for (const name of names) {
        const guests = await client.get<Guest[]>('/api/v1/guests', { search: name });
        const guestList = guests as unknown as Guest[];

        if (guestList.length === 0) {
          notFound.push(name);
        } else if (guestList.length === 1) {
          resolved.push(guestList[0]!);
        } else {
          // Multiple matches -- pick first but note ambiguity
          resolved.push(guestList[0]!);
          disambiguationNotes.push(
            `Found ${guestList.length} guests matching "${name}". Using "${guestList[0]!.name}" (${guestList[0]!.email ?? 'no email'}). If this is wrong, specify the full name.`,
          );
        }
      }

      if (notFound.length > 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: `Could not find guest(s): ${notFound.join(', ')}. Please verify the name(s) or create the guest(s) first.`,
            }, null, 2),
          }],
          details: {},
        };
      }

      // 2. Check availability
      const available = await client.get<AvailabilityRoom[]>('/api/v1/availability', {
        checkIn: params.checkIn,
        checkOut: params.checkOut,
      });
      const rooms = available as unknown as AvailabilityRoom[];

      if (rooms.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: `No rooms available for ${formatDate(params.checkIn)} - ${formatDate(params.checkOut)}. All rooms are booked for these dates.`,
            }, null, 2),
          }],
          details: {},
        };
      }

      // 3. Match room type if specified
      let selectedRoom: AvailabilityRoom | undefined;
      if (params.roomType) {
        const roomTypeLower = params.roomType.toLowerCase();
        selectedRoom = rooms.find(
          (r) => r.roomTypeName.toLowerCase().includes(roomTypeLower),
        );
        if (!selectedRoom) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: true,
                message: `No "${params.roomType}" room available for these dates. Available room types: ${[...new Set(rooms.map((r) => r.roomTypeName))].join(', ')}.`,
              }, null, 2),
            }],
            details: {},
          };
        }
      } else {
        selectedRoom = rooms[0]!;
      }

      // 4. Calculate nights and prepare action
      const nights = formatNights(params.checkIn, params.checkOut);
      const actionId = crypto.randomUUID();
      const bookingStatus = params.status === 'inquiry' ? 'inquiry' : 'confirmed';

      storePendingAction({
        id: actionId,
        type: 'create_booking',
        summary: `Booking for ${resolved.map(g => g.name).join(', ')}: ${selectedRoom.roomName} (${selectedRoom.roomTypeName}), ${formatDate(params.checkIn)} - ${formatDate(params.checkOut)}, ${nights} nights, ${formatEurCents(selectedRoom.totalPrice)}`,
        payload: {
          guestIds: resolved.map(g => g.id),
          roomId: selectedRoom.room.id,
          checkIn: params.checkIn,
          checkOut: params.checkOut,
          totalPrice: selectedRoom.totalPrice,
          status: bookingStatus,
          notes: params.notes ?? null,
          source: 'assistant',
        },
        createdAt: Date.now(),
      });

      const result: Record<string, unknown> = {
        actionId,
        summary: {
          guests: resolved.map(g => ({ name: g.name, email: g.email })),
          room: selectedRoom.roomName,
          roomType: selectedRoom.roomTypeName,
          checkIn: formatDate(params.checkIn),
          checkOut: formatDate(params.checkOut),
          nights,
          totalPrice: formatEurCents(selectedRoom.totalPrice),
          status: bookingStatus,
          notes: params.notes ?? null,
        },
        instruction: 'Present this as a structured summary table and ask Ines to reply OK to confirm or Cancel to reject.',
      };
      if (disambiguationNotes.length > 0) {
        result['disambiguationNotes'] = disambiguationNotes;
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  });

  // ── 2. Prepare Create Event ────────────────────────────

  api.registerTool({
    name: 'prepare_create_event',
    label: 'Prepare Event',
    description:
      'Prepare a new event for confirmation. Validates event type and returns a summary for Ines to review before creating.',
    parameters: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: 'Event type: puppy_yoga, beach_walk, or coffee_cake_cuddles' },
        title: { type: 'string', description: 'Event title' },
        date: { type: 'string', description: 'Event date (YYYY-MM-DD)' },
        time: { type: 'string', description: 'Event time (HH:MM, 24-hour format)' },
        capacity: { type: 'number', description: 'Maximum participants (default 8)' },
        location: { type: 'string', description: 'Event location (optional)' },
        description: { type: 'string', description: 'Event description (optional)' },
      },
      required: ['type', 'title', 'date', 'time'],
    },
    async execute(
      _id: string,
      params: {
        type: string;
        title: string;
        date: string;
        time: string;
        capacity?: number;
        location?: string;
        description?: string;
      },
    ) {
      // Validate event type
      const validTypes = ['puppy_yoga', 'beach_walk', 'coffee_cake_cuddles'];
      if (!validTypes.includes(params.type)) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: `Invalid event type "${params.type}". Must be one of: ${validTypes.join(', ')}.`,
            }, null, 2),
          }],
          details: {},
        };
      }

      const capacity = params.capacity ?? 8;
      const actionId = crypto.randomUUID();

      storePendingAction({
        id: actionId,
        type: 'create_event',
        summary: `${formatEventType(params.type)}: "${params.title}" on ${formatDate(params.date)} at ${params.time}, capacity ${capacity}`,
        payload: {
          type: params.type,
          title: params.title,
          date: params.date,
          time: params.time,
          capacity,
          location: params.location ?? null,
          description: params.description ?? null,
        },
        createdAt: Date.now(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            actionId,
            summary: {
              eventType: formatEventType(params.type),
              title: params.title,
              date: formatDate(params.date),
              time: params.time,
              capacity,
              location: params.location ?? null,
              description: params.description ?? null,
            },
            instruction: 'Present this as a structured summary and ask Ines to reply OK to confirm or Cancel to reject.',
          }, null, 2),
        }],
        details: {},
      };
    },
  });

  // ── 3. Confirm Action ──────────────────────────────────

  api.registerTool({
    name: 'confirm_action',
    label: 'Confirm Action',
    description:
      'Execute a previously prepared action after Ines confirms. Pass the actionId from the prepare step. Only call this when Ines explicitly says OK, yes, or go ahead.',
    parameters: {
      type: 'object' as const,
      properties: {
        actionId: { type: 'string', description: 'The action ID from the prepare step' },
      },
      required: ['actionId'],
    },
    async execute(_id: string, params: { actionId: string }) {
      // Opportunistic cleanup of stale actions
      cleanupStaleActions();

      const action = getPendingAction(params.actionId);
      if (!action) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: 'Action not found or already executed. It may have expired. Please prepare the action again.',
            }, null, 2),
          }],
          details: {},
        };
      }

      removePendingAction(params.actionId);

      try {
        switch (action.type) {
          case 'create_guest': {
            const guest = await client.post<{ id: string; name: string; email: string | null }>('/api/v1/guests', action.payload);
            const g = guest as unknown as { id: string; name: string; email: string | null };
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  message: `Guest "${g.name}" created successfully!`,
                  guest: { id: g.id, name: g.name, email: g.email },
                }, null, 2),
              }],
              details: {},
            };
          }

          case 'create_booking': {
            const booking = await client.post<Booking>('/api/v1/bookings', action.payload);
            const b = booking as unknown as Booking;
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  message: `Booking created successfully!`,
                  booking: {
                    id: b.id,
                    status: b.status,
                    checkIn: b.checkIn,
                    checkOut: b.checkOut,
                  },
                }, null, 2),
              }],
              details: {},
            };
          }

          case 'create_conversation_booking': {
            const {
              conversationId,
              payload,
            } = action.payload as {
              conversationId: string;
              payload: Record<string, unknown>;
            };
            const result = await client.post<{
              booking: { id: string; status: string; checkIn: string; checkOut: string };
              guest: { id: string; name: string; email: string | null };
              conversation: { id: string; guestId: string | null };
            }>(`/api/v1/conversations/${conversationId}/bookings`, payload);
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  message: 'Booking created from conversation successfully.',
                  booking: result.booking,
                  guest: result.guest,
                  conversation: result.conversation,
                }, null, 2),
              }],
              details: {},
            };
          }

          case 'create_event': {
            const event = await client.post<Record<string, unknown>>('/api/v1/events', action.payload);
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  message: `Event created successfully!`,
                  event,
                }, null, 2),
              }],
              details: {},
            };
          }

          case 'approve_draft': {
            const { conversationId, draftId, content } = action.payload as {
              conversationId: string;
              draftId: string;
              content?: string;
            };
            const requestBody = typeof content === 'string' && content.trim()
              ? { content }
              : {};
            await client.post(`/api/v1/conversations/${conversationId}/drafts/${draftId}/approve`, requestBody);
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  message: 'Email sent!',
                }, null, 2),
              }],
              details: {},
            };
          }

          case 'send_reminder': {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  message: 'Invoice reminder noted. The booking details have been presented for manual follow-up.',
                  bookingDetails: action.payload,
                }, null, 2),
              }],
              details: {},
            };
          }

          case 'update_guest': {
            const { guestId, ...changes } = action.payload as { guestId: string; [key: string]: unknown };
            const guest = await client.patch<{ id: string; name: string }>(`/api/v1/guests/${guestId}`, changes);
            const g = guest as unknown as { id: string; name: string };
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                success: true,
                message: `Guest "${g.name}" updated successfully!`,
              }, null, 2) }],
              details: {},
            };
          }

          case 'delete_guest': {
            const { guestId } = action.payload as { guestId: string };
            await client.del(`/api/v1/guests/${guestId}`);
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                success: true,
                message: 'Guest archived successfully. Their bookings and conversations are preserved.',
              }, null, 2) }],
              details: {},
            };
          }

          case 'merge_guests': {
            const { primaryId, secondaryId } = action.payload as { primaryId: string; secondaryId: string };
            const result = await client.post<{ id: string; name: string }>('/api/v1/guests/merge', { primaryId, secondaryId });
            const merged = result as unknown as { id: string; name: string };
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                success: true,
                message: `Guests merged successfully! "${merged.name}" is the primary record.`,
              }, null, 2) }],
              details: {},
            };
          }

          case 'update_booking': {
            const { bookingId, ...changes } = action.payload as { bookingId: string; [key: string]: unknown };
            const booking = await client.patch<Booking>(`/api/v1/bookings/${bookingId}`, changes);
            const b = booking as unknown as Booking;
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                success: true,
                message: `Booking updated successfully!`,
                booking: {
                  id: b.id,
                  status: b.status,
                  checkIn: b.checkIn,
                  checkOut: b.checkOut,
                },
              }, null, 2) }],
              details: {},
            };
          }

          case 'cancel_booking': {
            const { bookingId } = action.payload as { bookingId: string };
            await client.del(`/api/v1/bookings/${bookingId}`);
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                success: true,
                message: 'Booking cancelled successfully. Calendar has been updated.',
              }, null, 2) }],
              details: {},
            };
          }

          case 'update_event': {
            const { eventId, ...changes } = action.payload as { eventId: string; [key: string]: unknown };
            const event = await client.patch<Record<string, unknown>>(`/api/v1/events/${eventId}`, changes);
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                success: true,
                message: 'Event updated successfully!',
                event,
              }, null, 2) }],
              details: {},
            };
          }

          case 'delete_event': {
            const { eventId } = action.payload as { eventId: string };
            await client.del(`/api/v1/events/${eventId}`);
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                success: true,
                message: 'Event deleted permanently. All registrations have been removed.',
              }, null, 2) }],
              details: {},
            };
          }

          case 'register_guest_for_event': {
            const { eventId, guestId } = action.payload as { eventId: string; guestId: string };
            await client.post(`/api/v1/events/${eventId}/book`, { guestId });
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                success: true,
                message: 'Guest registered for the event successfully!',
              }, null, 2) }],
              details: {},
            };
          }

          case 'cancel_event_registration': {
            const { eventId, registrationId, guestName, eventTitle } = action.payload as {
              eventId: string;
              registrationId: string;
              guestName?: string;
              eventTitle?: string;
            };
            const registration = await client.post<{
              id: string;
              status: string;
              guest: { id: string; name: string; email: string | null };
            }>(`/api/v1/events/${eventId}/registrations/${registrationId}/cancel`);
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                success: true,
                message: `Removed ${guestName ?? registration.guest.name} from ${eventTitle ?? 'the event'} successfully.`,
                registration: {
                  id: registration.id,
                  status: registration.status,
                  guest: registration.guest,
                },
              }, null, 2) }],
              details: {},
            };
          }

          case 'log_payment': {
            const { bookingId, amount, method, date, notes } = action.payload as {
              bookingId: string; amount: number; method: string; date: string | null; notes: string | null;
            };
            const body: Record<string, unknown> = { amount, method };
            if (date) body['date'] = date;
            if (notes) body['notes'] = notes;
            const payment = await client.post<{ id: string; amount: number; method: string; date: string }>(
              `/api/v1/bookings/${bookingId}/payments`,
              body,
            );
            const p = payment as unknown as { id: string; amount: number; method: string; date: string };
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                success: true,
                message: `Payment of ${formatEurCents(amount)} logged successfully!`,
                payment: {
                  id: p.id,
                  amount: formatEurCents(p.amount),
                  method: p.method,
                  date: formatDate(p.date),
                },
              }, null, 2) }],
              details: {},
            };
          }

          default: {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: true,
                message: `Unknown action type: ${String(action.type)}`,
              }, null, 2) }],
              details: {},
            };
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Handle 409 Conflict specifically (room no longer available)
        if (message.includes('409')) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: true,
                message: 'Room is no longer available -- it was booked by someone else in the meantime. Want me to check for other available rooms?',
              }, null, 2),
            }],
            details: {},
          };
        }
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: `Failed to execute action: ${message}. No changes were applied.`,
            }, null, 2),
          }],
          details: {},
        };
      }

    },
  });

  // ── 4. Cancel Action ───────────────────────────────────

  api.registerTool({
    name: 'cancel_action',
    label: 'Cancel Action',
    description:
      'Cancel a previously prepared action when Ines rejects it. Call this when Ines says cancel, no, or stop.',
    parameters: {
      type: 'object' as const,
      properties: {
        actionId: { type: 'string', description: 'The action ID to cancel' },
      },
      required: ['actionId'],
    },
    async execute(_id: string, params: { actionId: string }) {
      cleanupStaleActions();
      const existed = removePendingAction(params.actionId);
      return {
        content: [{
          type: 'text' as const,
          text: existed ? 'Action cancelled.' : 'Action not found (may have already been cancelled or expired).',
        }],
        details: {},
      };
    },
  });

  // ── 5. Send Invoice Reminder ───────────────────────────

  api.registerTool({
    name: 'send_invoice_reminder',
    label: 'Send Invoice Reminder',
    description:
      'List overdue bookings (checked out with unpaid or partial payment status) or get details for a specific booking to send a reminder. Surfaces payment information for Ines to take action.',
    parameters: {
      type: 'object' as const,
      properties: {
        bookingId: { type: 'string', description: 'Specific booking ID to remind (optional -- if omitted, lists overdue bookings)' },
      },
      required: [],
    },
    async execute(_id: string, params: { bookingId?: string }) {
      if (!params.bookingId) {
        // List checked_out bookings and filter by paymentStatus
        const bookings = await client.get<Booking[]>('/api/v1/bookings', { status: 'checked_out', limit: 50 });
        const overdueList = (bookings as unknown as Booking[]).filter(
          (b) => b.paymentStatus === 'unpaid' || b.paymentStatus === 'partial',
        );

        if (overdueList.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                message: 'No overdue bookings found. All checked-out bookings appear to be settled.',
              }, null, 2),
            }],
            details: {},
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              overdueBookings: overdueList.map((b) => {
                const guestNameStr = getGuestNames(b).join(', ') || 'Unknown';
                return {
                  id: b.id,
                  guests: guestNameStr,
                  checkIn: formatDate(b.checkIn),
                  checkOut: formatDate(b.checkOut),
                  totalPrice: formatEurCents(b.totalPrice),
                  paymentStatus: formatPaymentStatus(b.paymentStatus ?? 'unpaid'),
                  dashboardUrl: dashboardUrl(`/bookings/${b.id}`),
                };
              }),
              totalOverdue: overdueList.length,
              instruction: 'Present these overdue bookings and ask Ines which one(s) to follow up on.',
            }, null, 2),
          }],
          details: {},
        };
      }

      // Get specific booking details
      const booking = await client.get<Booking>(`/api/v1/bookings/${params.bookingId}`);
      const b = booking as unknown as Booking;
      const guestNameStr = getGuestNames(b).join(', ') || 'Unknown';

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            booking: {
              id: b.id,
              guests: guestNameStr,
              checkIn: formatDate(b.checkIn),
              checkOut: formatDate(b.checkOut),
              totalPrice: formatEurCents(b.totalPrice),
              paymentStatus: b.paymentStatus ? formatPaymentStatus(b.paymentStatus) : 'Unknown',
              paymentSummary: b.paymentSummary ? {
                totalPrice: formatEurCents(b.paymentSummary.totalPrice),
                totalPaid: formatEurCents(b.paymentSummary.totalPaid),
                balanceDue: formatEurCents(b.paymentSummary.balanceDue),
              } : undefined,
              status: b.status,
              dashboardUrl: dashboardUrl(`/bookings/${b.id}`),
            },
            instruction: 'Here are the booking details for Ines to send a manual reminder or log a payment.',
          }, null, 2),
        }],
        details: {},
      };
    },
  });

  // ── 6. Update Briefing Time ────────────────────────────

  api.registerTool({
    name: 'update_briefing_time',
    label: 'Update Briefing Time',
    description:
      'Update the morning briefing delivery time. Ines can say "Change my briefing to 8 AM" and this tool updates the setting.',
    parameters: {
      type: 'object' as const,
      properties: {
        time: { type: 'string', description: 'New briefing time in HH:MM format (24-hour, e.g., 07:30 or 08:00)' },
      },
      required: ['time'],
    },
    async execute(_id: string, params: { time: string }) {
      // Validate time format
      if (!/^\d{2}:\d{2}$/.test(params.time)) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: `Invalid time format "${params.time}". Please use HH:MM format (e.g., 07:30).`,
            }, null, 2),
          }],
          details: {},
        };
      }

      const [hours, minutes] = params.time.split(':').map(Number);
      if (hours === undefined || minutes === undefined || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: `Invalid time "${params.time}". Hours must be 00-23 and minutes 00-59.`,
            }, null, 2),
          }],
          details: {},
        };
      }

      await client.post('/api/v1/settings', { key: 'morning_briefing_time', value: params.time });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            message: `Morning briefing time updated to ${params.time} (Cyprus time). The change takes effect from tomorrow.`,
          }, null, 2),
        }],
        details: {},
      };
    },
  });
}
