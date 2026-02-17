import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Query keys factory
export const guestKeys = {
  all: ['guests'] as const,
  lists: () => [...guestKeys.all, 'list'] as const,
  list: (filters?: GuestFilters) => [...guestKeys.lists(), filters] as const,
  details: () => [...guestKeys.all, 'detail'] as const,
  detail: (id: string) => [...guestKeys.details(), id] as const,
};

// Types
export interface Guest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  language: string;
  dietaryNeeds: string | null;
  source: string | null;
  tags: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GuestWithHistory extends Guest {
  bookings?: Array<{
    id: string;
    checkIn: string;
    checkOut: string;
    status: string;
    totalPrice: number;
  }>;
  eventBookings?: Array<{
    id: string;
    event: {
      id: string;
      title: string;
      date: string;
    };
  }>;
}

export interface GuestFilters {
  search?: string;
  source?: string;
  tags?: string[];
  cursor?: string;
  limit?: number;
}

export interface CreateGuestData {
  name: string;
  email?: string;
  phone?: string;
  language?: string;
  dietaryNeeds?: string;
  source?: string;
  tags?: string[];
  notes?: string;
}

export interface UpdateGuestData extends Partial<CreateGuestData> {}

// Hooks
export function useGuests(filters?: GuestFilters) {
  return useQuery({
    queryKey: guestKeys.list(filters),
    queryFn: async () => {
      const response = await api.get<{ data: Guest[]; nextCursor: string | null; hasMore: boolean }>(
        '/api/v1/guests',
        { params: filters as Record<string, string | number | boolean | undefined> }
      );
      return response.data;
    },
  });
}

export function useGuest(id: string | undefined) {
  return useQuery({
    queryKey: guestKeys.detail(id!),
    queryFn: async () => {
      const response = await api.get<{ data: GuestWithHistory }>(`/api/v1/guests/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateGuest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateGuestData) => {
      const response = await api.post<{ data: Guest }>('/api/v1/guests', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guestKeys.lists() });
    },
  });
}

export function useUpdateGuest(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateGuestData) => {
      const response = await api.patch<{ data: Guest }>(`/api/v1/guests/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guestKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: guestKeys.lists() });
    },
  });
}

export function useDeleteGuest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/guests/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guestKeys.lists() });
    },
  });
}

export function useMergeGuests() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      const response = await api.post<{ data: Guest }>('/api/v1/guests/merge', {
        sourceId,
        targetId,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guestKeys.lists() });
    },
  });
}
