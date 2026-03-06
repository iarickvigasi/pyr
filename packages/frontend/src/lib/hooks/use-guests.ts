import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';

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
  _count: { bookings: number; conversations: number; eventBookings: number };
  bookings?: Array<{
    id: string;
    checkIn: string;
    checkOut: string;
    status: string;
    totalPrice: number;
    createdAt: string;
    room: { name: string; roomType: { name: string } };
  }>;
  eventBookings?: Array<{
    id: string;
    status: string;
    createdAt: string;
    event: { id: string; title: string; date: string; type: string; time: string };
  }>;
  conversations?: Array<{
    id: string;
    channel: string;
    subject: string | null;
    status: string;
    lastMessageAt: string | null;
    createdAt: string;
  }>;
}

export interface GuestFilters {
  search?: string;
  source?: string;
  tag?: string;
  language?: string;
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

export type UpdateGuestData = Partial<CreateGuestData>;

export interface MergeGuestsInput {
  primaryId: string;
  secondaryId: string;
}

export interface GuestListResponse {
  data: Guest[];
  nextCursor: string | null;
  hasMore: boolean;
}

// Hooks
export function useGuests(filters?: GuestFilters) {
  return useQuery({
    queryKey: queryKeys.guests.list(filters as Record<string, unknown>),
    queryFn: async () => {
      const response = await api.get<GuestListResponse>(
        '/api/v1/guests',
        { params: filters as Record<string, string | number | boolean | undefined> }
      );
      // Return the full response including nextCursor and hasMore
      return response;
    },
  });
}

export function useGuest(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.guests.detail(id!),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.guests.all });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.guests.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.guests.all });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.guests.all });
    },
  });
}

export function useMergeGuests() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ primaryId, secondaryId }: MergeGuestsInput) => {
      const response = await api.post<{ data: Guest }>('/api/v1/guests/merge', {
        primaryId,
        secondaryId,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.guests.all });
    },
  });
}
