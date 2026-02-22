import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';
import { formatDate, dashboardUrl } from '../lib/formatters.js';

interface Guest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  language: string | null;
  dietaryNeeds: string | null;
  source: string | null;
  tags: string[];
  notes: string | null;
  createdAt: string;
  bookings?: Array<{
    id: string;
    checkIn: string;
    checkOut: string;
    status: string;
    totalPrice: number;
  }>;
  conversations?: Array<{
    id: string;
    subject: string | null;
    status: string;
  }>;
}

function formatGuest(g: Guest): Record<string, unknown> {
  return {
    name: g.name,
    email: g.email,
    phone: g.phone,
    language: g.language,
    dietaryNeeds: g.dietaryNeeds,
    source: g.source,
    tags: g.tags,
    notes: g.notes,
    memberSince: formatDate(g.createdAt),
    dashboardUrl: dashboardUrl(`/guests/${g.id}`),
  };
}

function formatGuestDetail(g: Guest): Record<string, unknown> {
  return {
    ...formatGuest(g),
    bookings: g.bookings?.map(b => ({
      id: b.id,
      checkIn: formatDate(b.checkIn),
      checkOut: formatDate(b.checkOut),
      status: b.status,
      totalPrice: b.totalPrice,
      dashboardUrl: dashboardUrl(`/bookings/${b.id}`),
    })),
    conversations: g.conversations?.map(c => ({
      id: c.id,
      subject: c.subject,
      status: c.status,
      dashboardUrl: dashboardUrl(`/conversations/${c.id}`),
    })),
  };
}

export function registerGuestTools(api: OpenClawPluginApi, client: ApiClient): void {
  api.registerTool({
    name: 'search_guests',
    label: 'Search Guests',
    description:
      'Search for guests by name, email, or phone number. Returns matching guest profiles. Example: search for "Anna" or "anna@gmail.com" or "+49".',
    parameters: Type.Object({
      search: Type.String({ description: 'Search term (name, email, or phone)' }),
      limit: Type.Optional(Type.Number({ description: 'Max results (default 10)', default: 10 })),
    }),
    async execute(_id: string, params: { search: string; limit?: number }) {
      const data = await client.get<Guest[]>('/api/v1/guests', {
        search: params.search,
        limit: params.limit ?? 10,
      });
      const guests = (data as unknown as Guest[]);
      const result = {
        guests: guests.map(formatGuest),
        totalReturned: guests.length,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  });

  api.registerTool({
    name: 'get_guest',
    label: 'Get Guest Details',
    description:
      'Get a specific guest profile with full details including booking history and conversations. Use when you already have a guest ID.',
    parameters: Type.Object({
      guestId: Type.String({ description: 'The guest ID (UUID)' }),
    }),
    async execute(_id: string, params: { guestId: string }) {
      const data = await client.get<Guest>(`/api/v1/guests/${params.guestId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(formatGuestDetail(data as unknown as Guest), null, 2) }], details: {} };
    },
  });

  api.registerTool({
    name: 'list_guests',
    label: 'List Guests',
    description:
      'List recent guests. Useful to see who was added recently or browse the guest list. Results are sorted by creation date.',
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: 'Max results (default 10)', default: 10 })),
    }),
    async execute(_id: string, params: { limit?: number }) {
      const data = await client.get<Guest[]>('/api/v1/guests', {
        limit: params.limit ?? 10,
      });
      const guests = (data as unknown as Guest[]);
      const result = {
        guests: guests.map(formatGuest),
        totalReturned: guests.length,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  });
}
