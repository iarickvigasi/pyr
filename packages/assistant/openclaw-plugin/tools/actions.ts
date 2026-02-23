import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';
import {
  storePendingAction,
  getPendingAction,
  removePendingAction,
  cleanupStaleActions,
} from '../lib/confirmation.js';
import { formatDate, formatEurCents, formatEventType, formatNights } from '../lib/formatters.js';

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
  room?: { id: string; name: string; roomType?: { name: string } };
}

// ─── Tool Registration ───────────────────────────────────

export function registerActionTools(api: OpenClawPluginApi, client: ApiClient): void {
  // ── 1. Prepare Create Booking ──────────────────────────

  api.registerTool({
    name: 'prepare_create_booking',
    label: 'Prepare Booking',
    description:
      'Prepare a new booking for confirmation. Searches for the guest, checks room availability, calculates price, and returns a summary for Ines to review before creating. NEVER execute a booking without showing the summary first.',
    parameters: {
      type: 'object' as const,
      properties: {
        guestName: { type: 'string', description: 'Guest name to search for' },
        roomType: { type: 'string', description: 'Room type preference (e.g., Suite, Standard). Optional -- picks first available if not specified.' },
        checkIn: { type: 'string', description: 'Check-in date (YYYY-MM-DD)' },
        checkOut: { type: 'string', description: 'Check-out date (YYYY-MM-DD)' },
        status: { type: 'string', description: 'Booking status: inquiry or confirmed (default: confirmed)' },
        notes: { type: 'string', description: 'Optional notes for the booking' },
      },
      required: ['guestName', 'checkIn', 'checkOut'],
    },
    async execute(
      _id: string,
      params: {
        guestName: string;
        roomType?: string;
        checkIn: string;
        checkOut: string;
        status?: string;
        notes?: string;
      },
    ) {
      // 1. Search for the guest
      const guests = await client.get<Guest[]>('/api/v1/guests', { search: params.guestName });
      const guestList = guests as unknown as Guest[];

      if (guestList.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: `No guest found matching "${params.guestName}". Please verify the name or create the guest first.`,
            }, null, 2),
          }],
          details: {},
        };
      }

      // Pick first match (LLM can disambiguate if multiple)
      const guest = guestList[0]!;
      const disambiguationNote = guestList.length > 1
        ? `Found ${guestList.length} guests matching "${params.guestName}". Using "${guest.name}" (${guest.email ?? 'no email'}). If this is wrong, specify the full name.`
        : undefined;

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
        summary: `Booking for ${guest.name}: ${selectedRoom.roomName} (${selectedRoom.roomTypeName}), ${formatDate(params.checkIn)} - ${formatDate(params.checkOut)}, ${nights} nights, ${formatEurCents(selectedRoom.totalPrice)}`,
        payload: {
          guestId: guest.id,
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
          guest: guest.name,
          guestEmail: guest.email,
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
      if (disambiguationNote) {
        result['disambiguationNote'] = disambiguationNote;
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
            const { conversationId, draftId } = action.payload as { conversationId: string; draftId: string };
            await client.post(`/api/v1/conversations/${conversationId}/drafts/${draftId}/approve`);
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
            // Phase 2 feature -- for now, return the booking details for manual follow-up
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  message: 'Invoice reminder noted. Full invoice/payment automation is coming in Phase 2. For now, the booking details have been presented for manual follow-up.',
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
              message: `Failed to execute action: ${message}`,
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
      'List overdue bookings (checked out but unpaid) or get details for a specific booking to send a reminder. Since invoice automation is Phase 2, this surfaces the information for Ines to take manual action.',
    parameters: {
      type: 'object' as const,
      properties: {
        bookingId: { type: 'string', description: 'Specific booking ID to remind (optional -- if omitted, lists overdue bookings)' },
      },
      required: [],
    },
    async execute(_id: string, params: { bookingId?: string }) {
      if (!params.bookingId) {
        // List checked_out bookings with totalPrice > 0 (potential overdue)
        const bookings = await client.get<Booking[]>('/api/v1/bookings', { status: 'checked_out' });
        const overdue = (bookings as unknown as Booking[]).filter((b) => b.totalPrice > 0);

        if (overdue.length === 0) {
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
              overdueBookings: overdue.map((b) => ({
                id: b.id,
                guestName: b.guest?.name,
                guestEmail: b.guest?.email,
                checkIn: formatDate(b.checkIn),
                checkOut: formatDate(b.checkOut),
                totalPrice: formatEurCents(b.totalPrice),
              })),
              totalOverdue: overdue.length,
              instruction: 'Present these overdue bookings and ask Ines which one(s) to follow up on.',
            }, null, 2),
          }],
          details: {},
        };
      }

      // Get specific booking details
      const booking = await client.get<Booking>(`/api/v1/bookings/${params.bookingId}`);
      const b = booking as unknown as Booking;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            booking: {
              id: b.id,
              guestName: b.guest?.name,
              guestEmail: b.guest?.email,
              checkIn: formatDate(b.checkIn),
              checkOut: formatDate(b.checkOut),
              totalPrice: formatEurCents(b.totalPrice),
              status: b.status,
            },
            message: 'Full invoice/payment automation is coming in Phase 2. For now, here are the booking details to help Ines send a manual reminder.',
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
