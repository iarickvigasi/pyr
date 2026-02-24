import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  });
}

export const queryKeys = {
  bookings: {
    all: ['bookings'] as const,
    list: (filters: Record<string, unknown>) =>
      ['bookings', 'list', filters] as const,
    detail: (id: string) => ['bookings', 'detail', id] as const,
    calendar: (from: string, to: string) =>
      ['bookings', 'calendar', from, to] as const,
  },
  events: {
    all: ['events'] as const,
    list: (filters: Record<string, unknown>) =>
      ['events', 'list', filters] as const,
    detail: (id: string) => ['events', 'detail', id] as const,
    registrations: (id: string) => ['events', 'registrations', id] as const,
  },
  guests: {
    all: ['guests'] as const,
    list: (filters: Record<string, unknown>) =>
      ['guests', 'list', filters] as const,
    detail: (id: string) => ['guests', 'detail', id] as const,
  },
  rooms: {
    all: ['rooms'] as const,
    types: ['room-types'] as const,
    seasons: ['seasons'] as const,
    availability: (checkIn: string, checkOut: string) =>
      ['availability', checkIn, checkOut] as const,
  },
  conversations: {
    all: ['conversations'] as const,
    list: (filters: Record<string, unknown>) =>
      ['conversations', 'list', filters] as const,
    detail: (id: string) => ['conversations', 'detail', id] as const,
    drafts: (id: string) => ['conversations', 'drafts', id] as const,
    unreadCount: ['conversations', 'unread-count'] as const,
  },
  dashboard: {
    stats: ['dashboard', 'stats'] as const,
    today: ['dashboard', 'today'] as const,
  },
  payments: {
    list: (bookingId: string) => ['payments', 'list', bookingId] as const,
  },
  settings: {
    all: ['settings'] as const,
    key: (k: string) => ['settings', k] as const,
  },
};
