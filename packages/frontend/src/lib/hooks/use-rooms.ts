import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';

export function useRoomTypes() {
  return useQuery({
    queryKey: queryKeys.rooms.types,
    queryFn: () =>
      api.get<{
        data: Array<{
          id: string;
          name: string;
          description: string | null;
          basePrice: number;
          maxOccupancy: number;
          _count?: { rooms: number };
        }>;
      }>('/api/v1/room-types'),
    staleTime: 5 * 60_000,
  });
}

export function useRooms() {
  return useQuery({
    queryKey: queryKeys.rooms.all,
    queryFn: () =>
      api.get<{
        data: Array<{
          id: string;
          roomTypeId: string;
          name: string;
          status: string;
          roomType: { id: string; name: string; basePrice: number; maxOccupancy: number };
        }>;
      }>('/api/v1/rooms'),
    staleTime: 5 * 60_000,
  });
}

export function useSeasons() {
  return useQuery({
    queryKey: queryKeys.rooms.seasons,
    queryFn: () =>
      api.get<{
        data: Array<{
          id: string;
          name: string;
          startDate: string;
          endDate: string;
          priceMultiplier: number;
        }>;
      }>('/api/v1/seasons'),
    staleTime: 5 * 60_000,
  });
}

export function useCreateRoomType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; basePrice: number; maxOccupancy: number }) =>
      api.post('/api/v1/room-types', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rooms.types }),
  });
}

export function useUpdateRoomType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      api.patch(`/api/v1/room-types/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rooms.types }),
  });
}

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { roomTypeId: string; name: string }) =>
      api.post('/api/v1/rooms', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rooms.all }),
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      api.patch(`/api/v1/rooms/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rooms.all }),
  });
}

export function useCreateSeason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; startDate: string; endDate: string; priceMultiplier: number }) =>
      api.post('/api/v1/seasons', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rooms.seasons }),
  });
}

export function useUpdateSeason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      api.patch(`/api/v1/seasons/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rooms.seasons }),
  });
}
