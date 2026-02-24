import { useQuery, useMutation, useQueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';

interface BookingGuest {
  id: string;
  bookingId: string;
  guestId: string;
  guest: { id: string; name: string; email: string | null };
}

interface BookingListItem {
  id: string;
  guestId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  status: string;
  totalPrice: number;
  source: string | null;
  notes: string | null;
  needsReview: boolean;
  sourceConversationId: string | null;
  guest: { id: string; name: string; email: string | null; phone: string | null; language: string };
  room: { id: string; name: string; roomType: { id: string; name: string; basePrice: number; maxOccupancy: number } };
  bookingGuests: BookingGuest[];
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  totalPaid: number;
}

interface BookingListResponse {
  data: BookingListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface BookingPayment {
  id: string;
  bookingId: string;
  amount: number;
  method: string;
  date: string;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
}

interface BookingPaymentSummary {
  totalPrice: number;
  totalPaid: number;
  balanceDue: number;
}

interface BookingDetail {
  id: string;
  guestId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  status: string;
  totalPrice: number;
  source: string | null;
  notes: string | null;
  needsReview: boolean;
  sourceConversationId: string | null;
  createdAt: string;
  updatedAt: string;
  guest: { id: string; name: string; email: string | null; phone: string | null; language: string };
  room: { id: string; name: string; roomType: { id: string; name: string; basePrice: number; maxOccupancy: number } };
  bookingGuests: BookingGuest[];
  payments: BookingPayment[];
  paymentSummary: BookingPaymentSummary;
}

interface BookingDetailResponse {
  data: BookingDetail;
}

interface BookingListParams {
  status?: string;
  paymentStatus?: string;
  from?: string;
  to?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export function useBookings(params: BookingListParams): UseQueryResult<BookingListResponse> {
  return useQuery({
    queryKey: queryKeys.bookings.list(params as Record<string, unknown>),
    queryFn: () =>
      api.get<BookingListResponse>('/api/v1/bookings', { params: params as Record<string, string> }),
  });
}

export function useBooking(id: string): UseQueryResult<BookingDetailResponse> {
  return useQuery({
    queryKey: queryKeys.bookings.detail(id),
    queryFn: () =>
      api.get<BookingDetailResponse>(`/api/v1/bookings/${id}`),
    enabled: !!id,
  });
}

export function useCreateBooking(): UseMutationResult<unknown, Error, {
  guestIds: string[];
  roomId: string;
  checkIn: string;
  checkOut: string;
  status?: string;
  totalPrice: number;
  source?: string;
  notes?: string;
}> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      guestIds: string[];
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

export function useUpdateBooking(): UseMutationResult<unknown, Error, { id: string; [key: string]: unknown }> {
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

export function useCancelBooking(): UseMutationResult<unknown, Error, string> {
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

export function useCreatePayment(bookingId: string): UseMutationResult<unknown, Error, { amount: number; method: string; date?: string; notes?: string | null }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { amount: number; method: string; date?: string; notes?: string | null }) =>
      api.post(`/api/v1/bookings/${bookingId}/payments`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
      qc.invalidateQueries({ queryKey: queryKeys.bookings.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
    },
  });
}

export function useDeletePayment(bookingId: string): UseMutationResult<unknown, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) =>
      api.delete(`/api/v1/bookings/${bookingId}/payments/${paymentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
      qc.invalidateQueries({ queryKey: queryKeys.bookings.all });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
    },
  });
}

export function useAvailability(checkIn: string, checkOut: string): UseQueryResult<{
  data: Array<{
    roomId: string;
    roomName: string;
    roomTypeName: string;
    totalPrice: number;
    nightlyBreakdown: Array<{ date: string; price: number }>;
  }>;
}> {
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
