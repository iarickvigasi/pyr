import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';
import { formatDate, formatEventType, dashboardUrl } from '../lib/formatters.js';
import { storePendingAction } from '../lib/confirmation.js';

interface EventRecord {
  id: string;
  type: string;
  title: string;
  date: string;
  time: string | null;
  capacity: number;
  location: string | null;
  description: string | null;
  _count?: { eventBookings: number };
}

interface EventRegistration {
  id: string;
  status: string;
  attendeeCount?: number;
  guest: { id: string; name: string; email: string | null; phone: string | null };
}

function formatEvent(e: EventRecord): Record<string, unknown> {
  return {
    id: e.id,
    type: formatEventType(e.type),
    title: e.title,
    date: formatDate(e.date),
    time: e.time,
    capacity: e.capacity,
    registered: e._count?.eventBookings ?? 0,
    spotsLeft: e.capacity - (e._count?.eventBookings ?? 0),
    location: e.location,
    dashboardUrl: dashboardUrl(`/events/${e.id}`),
  };
}

function formatEventDetail(e: EventRecord): Record<string, unknown> {
  return {
    ...formatEvent(e),
    description: e.description,
  };
}

export function registerEventTools(api: OpenClawPluginApi, client: ApiClient): void {
  api.registerTool({
    name: 'list_events',
    label: 'List Events',
    description:
      'List scheduled events (puppy yoga classes, beach walks, coffee & cuddle sessions). Can filter by date range. Shows capacity and how many spots are taken.',
    parameters: {
      type: 'object' as const,
      properties: {
        from: { type: 'string', description: 'Start date filter (ISO format)' },
        to: { type: 'string', description: 'End date filter (ISO format)' },
        limit: { type: 'number', description: 'Max results (default 20)', default: 20 },
      },
      required: [],
    },
    async execute(_id: string, params: { from?: string; to?: string; limit?: number }) {
      const data = await client.get<EventRecord[]>('/api/v1/events', {
        from: params.from,
        to: params.to,
        limit: params.limit ?? 20,
      });
      const events = data as unknown as EventRecord[];
      const result = {
        events: events.map(formatEvent),
        totalReturned: events.length,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  });

  api.registerTool({
    name: 'get_event',
    label: 'Get Event Details',
    description:
      'Get full details of a specific event including description, location, and capacity info.',
    parameters: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'string', description: 'The event ID (UUID)' },
      },
      required: ['eventId'],
    },
    async execute(_id: string, params: { eventId: string }) {
      const data = await client.get<EventRecord>(`/api/v1/events/${params.eventId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(formatEventDetail(data as unknown as EventRecord), null, 2) }], details: {} };
    },
  });

  api.registerTool({
    name: 'list_event_registrations',
    label: 'List Event Registrations',
    description:
      'List guests registered for a specific event. Shows who signed up and their contact details.',
    parameters: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'string', description: 'The event ID (UUID)' },
      },
      required: ['eventId'],
    },
    async execute(_id: string, params: { eventId: string }) {
      const data = await client.get<EventRegistration[]>(`/api/v1/events/${params.eventId}/registrations`);
      const registrations = (data as unknown as EventRegistration[]).map(r => ({
        registrationId: r.id,
        guestName: r.guest.name,
        guestEmail: r.guest.email,
        guestPhone: r.guest.phone,
        status: r.status,
        attendeeCount: r.attendeeCount ?? 1,
        guestDashboardUrl: dashboardUrl(`/guests/${r.guest.id}`),
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify({ registrations }, null, 2) }], details: {} };
    },
  });

  // ── 4. Prepare Update Event ──────────────────────────

  api.registerTool({
    name: 'prepare_update_event',
    label: 'Update Event',
    description:
      'Prepare an update to an existing event. Shows what will change and asks for confirmation. Can update type, title, date, time, capacity, location, or description.',
    parameters: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'string', description: 'The event ID (UUID)' },
        type: { type: 'string', description: 'Event type: puppy_yoga, beach_walk, or coffee_cake_cuddles' },
        title: { type: 'string', description: 'Updated event title' },
        date: { type: 'string', description: 'Updated event date (YYYY-MM-DD)' },
        time: { type: 'string', description: 'Updated event time (HH:MM, 24-hour format)' },
        capacity: { type: 'number', description: 'Updated maximum participants' },
        location: { type: 'string', description: 'Updated event location' },
        description: { type: 'string', description: 'Updated event description' },
      },
      required: ['eventId'],
    },
    async execute(
      _id: string,
      params: {
        eventId: string;
        type?: string;
        title?: string;
        date?: string;
        time?: string;
        capacity?: number;
        location?: string;
        description?: string;
      },
    ) {
      // Validate event type if provided
      if (params.type) {
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
      }

      // Fetch current event
      const current = await client.get<EventRecord>(`/api/v1/events/${params.eventId}`);
      const e = current as unknown as EventRecord;

      // Build diff of changed fields
      const diff: Record<string, { from: unknown; to: unknown }> = {};
      const changes: Record<string, unknown> = {};

      const fields: Array<{ key: keyof typeof params; currentVal: unknown }> = [
        { key: 'type', currentVal: e.type },
        { key: 'title', currentVal: e.title },
        { key: 'date', currentVal: e.date },
        { key: 'time', currentVal: e.time },
        { key: 'capacity', currentVal: e.capacity },
        { key: 'location', currentVal: e.location },
        { key: 'description', currentVal: e.description },
      ];

      for (const { key, currentVal } of fields) {
        if (params[key] !== undefined && params[key] !== currentVal) {
          diff[key] = { from: currentVal, to: params[key] };
          changes[key] = params[key];
        }
      }

      if (Object.keys(diff).length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              message: `No changes detected for event "${e.title}". The provided values match the current event.`,
            }, null, 2),
          }],
          details: {},
        };
      }

      const actionId = crypto.randomUUID();

      storePendingAction({
        id: actionId,
        type: 'update_event',
        summary: `Update event "${e.title}": ${Object.keys(diff).join(', ')}`,
        payload: { eventId: params.eventId, ...changes },
        createdAt: Date.now(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            actionId,
            event: e.title,
            changes: diff,
            instruction: 'Show Ines the before/after diff and ask her to reply OK to confirm or Cancel to reject.',
          }, null, 2),
        }],
        details: {},
      };
    },
  });

  // ── 5. Prepare Delete Event ──────────────────────────

  api.registerTool({
    name: 'prepare_delete_event',
    label: 'Delete Event',
    description:
      'Prepare permanent deletion of an event. Shows event details for Ines to confirm. WARNING: This is a hard delete -- the event and all guest registrations will be permanently removed.',
    parameters: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'string', description: 'The event ID (UUID) to delete' },
      },
      required: ['eventId'],
    },
    async execute(_id: string, params: { eventId: string }) {
      const current = await client.get<EventRecord>(`/api/v1/events/${params.eventId}`);
      const e = current as unknown as EventRecord;

      const actionId = crypto.randomUUID();
      const registered = e._count?.eventBookings ?? 0;

      storePendingAction({
        id: actionId,
        type: 'delete_event',
        summary: `Delete event "${e.title}" on ${formatDate(e.date)}`,
        payload: { eventId: params.eventId },
        createdAt: Date.now(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            actionId,
            summary: {
              action: 'Permanently delete event',
              type: formatEventType(e.type),
              title: e.title,
              date: formatDate(e.date),
              time: e.time,
              capacity: e.capacity,
              registered,
              location: e.location,
              warning: 'This will PERMANENTLY delete the event and all registrations. This cannot be undone.',
            },
            instruction: 'Present this summary and ask Ines to reply OK to confirm or Cancel to reject.',
          }, null, 2),
        }],
        details: {},
      };
    },
  });

  // ── 6. Prepare Register Guest for Event ──────────────

  api.registerTool({
    name: 'prepare_register_guest',
    label: 'Register Guest for Event',
    description:
      'Register a guest for an event. Searches for the guest by name, checks event capacity, and shows a summary for confirmation.',
    parameters: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'string', description: 'The event ID (UUID)' },
        guestName: { type: 'string', description: 'Guest name to search for' },
      },
      required: ['eventId', 'guestName'],
    },
    async execute(_id: string, params: { eventId: string; guestName: string }) {
      // 1. Search for the guest
      interface GuestResult { id: string; name: string; email: string | null }
      const guests = await client.get<GuestResult[]>('/api/v1/guests', { search: params.guestName });
      const guestList = guests as unknown as GuestResult[];

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

      const guest = guestList[0]!;
      const disambiguationNote = guestList.length > 1
        ? `Found ${guestList.length} guests matching "${params.guestName}". Using "${guest.name}" (${guest.email ?? 'no email'}). If this is wrong, specify the full name.`
        : undefined;

      // 2. Fetch event details
      const current = await client.get<EventRecord>(`/api/v1/events/${params.eventId}`);
      const e = current as unknown as EventRecord;

      const registered = e._count?.eventBookings ?? 0;
      const spotsLeft = e.capacity - registered;

      // 3. Check capacity
      let capacityWarning: string | undefined;
      if (spotsLeft <= 0) {
        capacityWarning = `Warning: This event is at full capacity (${e.capacity}/${e.capacity}). The registration may be added to a waitlist or rejected by the backend.`;
      }

      // 4. Store pending action
      const actionId = crypto.randomUUID();

      storePendingAction({
        id: actionId,
        type: 'register_guest_for_event',
        summary: `Register ${guest.name} for ${e.title} on ${formatDate(e.date)} (${spotsLeft} spots remaining)`,
        payload: { eventId: params.eventId, guestId: guest.id },
        createdAt: Date.now(),
      });

      const result: Record<string, unknown> = {
        actionId,
        summary: {
          guest: guest.name,
          guestEmail: guest.email,
          event: e.title,
          eventType: formatEventType(e.type),
          date: formatDate(e.date),
          time: e.time,
          spotsLeft,
          capacity: e.capacity,
          registered,
        },
        instruction: 'Present this as a structured summary and ask Ines to reply OK to confirm or Cancel to reject.',
      };
      if (disambiguationNote) {
        result['disambiguationNote'] = disambiguationNote;
      }
      if (capacityWarning) {
        result['capacityWarning'] = capacityWarning;
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  });

  api.registerTool({
    name: 'prepare_cancel_event_registration',
    label: 'Remove Guest From Event',
    description:
      'Prepare cancellation of a single guest registration from an event. Resolve the registration by guest name or registration ID, show the target clearly, and require confirmation before removing it.',
    parameters: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'string', description: 'The event ID (UUID)' },
        guestName: { type: 'string', description: 'Guest name to remove from the event' },
        registrationId: { type: 'string', description: 'Specific event registration ID, if already known' },
      },
      required: ['eventId'],
    },
    async execute(_id: string, params: { eventId: string; guestName?: string; registrationId?: string }) {
      if (!params.guestName && !params.registrationId) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: 'Provide either guestName or registrationId to remove a guest from an event.',
            }, null, 2),
          }],
          details: {},
        };
      }

      const event = await client.get<EventRecord>(`/api/v1/events/${params.eventId}`);
      const registrations = await client.get<EventRegistration[]>(`/api/v1/events/${params.eventId}/registrations`);
      const registrationList = registrations as unknown as EventRegistration[];

      const resolved = params.registrationId
        ? registrationList.filter((registration) => registration.id === params.registrationId)
        : findMatchingRegistrations(registrationList, params.guestName ?? '');

      if (resolved.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: params.registrationId
                ? `No registration found with ID "${params.registrationId}" for this event.`
                : `No registration found for "${params.guestName}" in this event.`,
            }, null, 2),
          }],
          details: {},
        };
      }

      if (resolved.length > 1) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: `Multiple registrations match "${params.guestName}". Please specify the exact guest or registration ID.`,
              candidates: resolved.map((registration) => ({
                registrationId: registration.id,
                guestName: registration.guest.name,
                guestEmail: registration.guest.email,
                status: registration.status,
              })),
            }, null, 2),
          }],
          details: {},
        };
      }

      const registration = resolved[0]!;
      if (registration.status === 'cancelled') {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              message: `${registration.guest.name} is already removed from "${event.title}". No changes were prepared.`,
            }, null, 2),
          }],
          details: {},
        };
      }

      const actionId = crypto.randomUUID();
      storePendingAction({
        id: actionId,
        type: 'cancel_event_registration',
        summary: `Remove ${registration.guest.name} from ${event.title} on ${formatDate(event.date)}`,
        payload: {
          eventId: params.eventId,
          registrationId: registration.id,
          guestName: registration.guest.name,
          eventTitle: event.title,
        },
        createdAt: Date.now(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            actionId,
            summary: {
              action: 'Remove guest from event',
              guest: registration.guest.name,
              guestEmail: registration.guest.email,
              event: event.title,
              date: formatDate(event.date),
              time: event.time,
              status: registration.status,
              attendeeCount: registration.attendeeCount ?? 1,
            },
            instruction: 'Present this as a structured summary and ask Ines to reply OK to confirm or Cancel to reject.',
          }, null, 2),
        }],
        details: {},
      };
    },
  });
}

function findMatchingRegistrations(registrations: EventRegistration[], guestNameQuery: string): EventRegistration[] {
  const query = guestNameQuery.trim().toLowerCase();
  if (!query) return [];

  const exact = registrations.filter((registration) => registration.guest.name.trim().toLowerCase() === query);
  if (exact.length > 0) return exact;

  return registrations.filter((registration) => registration.guest.name.toLowerCase().includes(query));
}
