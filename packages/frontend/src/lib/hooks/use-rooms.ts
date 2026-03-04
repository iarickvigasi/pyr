import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';

export interface RoomExternalMapping {
  id: string;
  roomId: string;
  provider: string;
  externalAccommodationId: string;
  externalAccommodationTypeId: string | null;
  defaultAdults: number | null;
  defaultChildren: number | null;
  room: {
    id: string;
    name: string;
    roomTypeId: string;
  };
}

export interface MotopressAccommodation {
  id: number;
  title: string;
  status: string;
  accommodationTypeId: number | null;
}

export interface MotopressImportResult {
  total: {
    externalRoomTypes: number;
    externalRooms: number;
  };
  skipped: {
    roomTypes: number;
    rooms: number;
  };
  roomTypes: {
    created: number;
    updated: number;
  };
  rooms: {
    created: number;
    updated: number;
  };
  mappings: {
    created: number;
    updated: number;
  };
}

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

export function useRoomMappings(provider?: string) {
  return useQuery({
    queryKey: queryKeys.rooms.mappings(provider),
    queryFn: () =>
      api.get<{ data: RoomExternalMapping[] }>('/api/v1/room-mappings', {
        params: provider ? { provider } : undefined,
      }),
    staleTime: 60_000,
  });
}

export function useMotopressAccommodations() {
  return useQuery({
    queryKey: queryKeys.rooms.motopressAccommodations,
    queryFn: () =>
      api.get<{ data: MotopressAccommodation[] }>('/api/v1/room-mappings/motopress/accommodations'),
    staleTime: 60_000,
  });
}

export function useImportMotopressRooms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ data: MotopressImportResult }>('/api/v1/room-mappings/motopress/import'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.rooms.types });
      qc.invalidateQueries({ queryKey: queryKeys.rooms.all });
      qc.invalidateQueries({ queryKey: queryKeys.rooms.mappings('motopress') });
      qc.invalidateQueries({ queryKey: queryKeys.rooms.motopressAccommodations });
    },
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

export function useDeleteRoomType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/room-types/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.rooms.types });
      qc.invalidateQueries({ queryKey: queryKeys.rooms.all });
    },
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

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/rooms/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.rooms.all });
      qc.invalidateQueries({ queryKey: queryKeys.rooms.types });
      qc.invalidateQueries({ queryKey: queryKeys.rooms.mappings('motopress') });
      qc.invalidateQueries({ queryKey: queryKeys.rooms.mappings() });
    },
  });
}

export function useCreateRoomMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      roomId: string;
      provider: string;
      externalAccommodationId: string;
      externalAccommodationTypeId?: string | null;
      defaultAdults?: number | null;
      defaultChildren?: number | null;
    }) => api.post('/api/v1/room-mappings', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.rooms.mappings('motopress') });
      qc.invalidateQueries({ queryKey: queryKeys.rooms.mappings() });
    },
  });
}

export function useUpdateRoomMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      api.patch(`/api/v1/room-mappings/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.rooms.mappings('motopress') });
      qc.invalidateQueries({ queryKey: queryKeys.rooms.mappings() });
    },
  });
}

export function useDeleteRoomMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/room-mappings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.rooms.mappings('motopress') });
      qc.invalidateQueries({ queryKey: queryKeys.rooms.mappings() });
    },
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
