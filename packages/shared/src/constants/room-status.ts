export const ROOM_STATUSES = [
  'available',
  'occupied',
  'maintenance',
] as const;

export type RoomStatus = (typeof ROOM_STATUSES)[number];
