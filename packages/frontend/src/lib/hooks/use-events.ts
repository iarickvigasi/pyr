import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';

interface EventListParams {
  type?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export function useEvents(params: EventListParams) {
  return useQuery({
    queryKey: queryKeys.events.list(params as Record<string, unknown>),
    queryFn: () =>
      api.get<{
        data: Array<{
          id: string;
          type: string;
          title: string;
          date: string;
          time: string;
          capacity: number;
          location: string | null;
          description: string | null;
          _count: { eventBookings: number };
        }>;
        nextCursor: string | null;
        hasMore: boolean;
      }>('/api/v1/events', { params: params as Record<string, string> }),
  });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: queryKeys.events.detail(id),
    queryFn: () =>
      api.get<{
        data: {
          id: string;
          type: string;
          title: string;
          date: string;
          time: string;
          capacity: number;
          location: string | null;
          description: string | null;
          createdAt: string;
          _count: { eventBookings: number };
        };
      }>(`/api/v1/events/${id}`),
    enabled: !!id,
  });
}

export function useEventRegistrations(id: string) {
  return useQuery({
    queryKey: queryKeys.events.registrations(id),
    queryFn: () =>
      api.get<{
        data: Array<{
          id: string;
          guestId: string;
          status: string;
          createdAt: string;
          guest: { id: string; name: string; email: string | null };
        }>;
      }>(`/api/v1/events/${id}/registrations`),
    enabled: !!id,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      type: string;
      title: string;
      date: string;
      time: string;
      capacity: number;
      location?: string;
      description?: string;
    }) => api.post('/api/v1/events', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.events.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.today });
    },
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      api.patch(`/api/v1/events/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.events.all });
    },
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/events/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.events.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
    },
  });
}

export function useRegisterGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, guestId }: { eventId: string; guestId: string }) =>
      api.post(`/api/v1/events/${eventId}/book`, { guestId }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.events.detail(vars.eventId) });
      qc.invalidateQueries({
        queryKey: queryKeys.events.registrations(vars.eventId),
      });
    },
  });
}
