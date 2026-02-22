import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';
import { formatDate, formatEventType, dashboardUrl } from '../lib/formatters.js';

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
    parameters: Type.Object({
      from: Type.Optional(Type.String({ description: 'Start date filter (ISO format)' })),
      to: Type.Optional(Type.String({ description: 'End date filter (ISO format)' })),
      limit: Type.Optional(Type.Number({ description: 'Max results (default 20)', default: 20 })),
    }),
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
    parameters: Type.Object({
      eventId: Type.String({ description: 'The event ID (UUID)' }),
    }),
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
    parameters: Type.Object({
      eventId: Type.String({ description: 'The event ID (UUID)' }),
    }),
    async execute(_id: string, params: { eventId: string }) {
      const data = await client.get<EventRegistration[]>(`/api/v1/events/${params.eventId}/registrations`);
      const registrations = (data as unknown as EventRegistration[]).map(r => ({
        guestName: r.guest.name,
        guestEmail: r.guest.email,
        guestPhone: r.guest.phone,
        status: r.status,
        guestDashboardUrl: dashboardUrl(`/guests/${r.guest.id}`),
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify({ registrations }, null, 2) }], details: {} };
    },
  });
}
