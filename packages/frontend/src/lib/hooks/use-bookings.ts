import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';
export { useGuests } from '@/lib/hooks/use-guests';

interface BookingListParams {
  status?: string;
  from?: string;
  to?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export function useBookings(params: BookingListParams) {
  return useQuery({
    queryKey: queryKeys.bookings.list(params as Record<string, unknown>),
    queryFn: () =>
      api.get<{
        data: Array<{
          id: string;
          guestId: string;
          roomId: string;
          checkIn: string;
          checkOut: string;
          status: string;
          totalPrice: number;
          source: string | null;
          notes: string | null;
          guest: { id: string; name: string; email: string | null; phone: string | null; language: string };
          room: { id: string; name: string; roomType: { id: string; name: string; basePrice: number; maxOccupancy: number } };
        }>;
        nextCursor: string | null;
        hasMore: boolean;
      }>('/api/v1/bookings', { params: params as Record<string, string> }),
  });
}

export function useBooking(id: string) {
  return useQuery({
    queryKey: queryKeys.bookings.detail(id),
    queryFn: () =>
      api.get<{
        data: {
          id: string;
          guestId: string;
          roomId: string;
          checkIn: string;
          checkOut: string;
          status: string;
          totalPrice: number;
          source: string | null;
          notes: string | null;
          createdAt: string;
          updatedAt: string;
          guest: { id: string; name: string; email: string | null; phone: string | null; language: string };
          room: { id: string; name: string; roomType: { id: string; name: string; basePrice: number; maxOccupancy: number } };
        };
      }>(`/api/v1/bookings/${id}`),
    enabled: !!id,
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      guestId: string;
      roomId: string;
      checkIn: string;
      checkOut: string;
      status?: string;
      totalPrice: number;
      source?: string;
      notes?: string;
    }) => api.post('/api/v1/bookings', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.today });
    },
  });
}

export function useUpdateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      api.patch(`/api/v1/bookings/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.today });
    },
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/bookings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.today });
    },
  });
}

export function useAvailability(checkIn: string, checkOut: string) {
  return useQuery({
    queryKey: queryKeys.rooms.availability(checkIn, checkOut),
    queryFn: () =>
      api.get<{
        data: Array<{
          roomId: string;
          roomName: string;
          roomTypeName: string;
          totalPrice: number;
          nightlyBreakdown: Array<{ date: string; price: number }>;
        }>;
      }>('/api/v1/availability', { params: { checkIn, checkOut } }),
    enabled: !!checkIn && !!checkOut,
  });
}

