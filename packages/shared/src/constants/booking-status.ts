export const BOOKING_STATUSES = [
  'inquiry',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];
