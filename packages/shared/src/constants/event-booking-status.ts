export const EVENT_BOOKING_STATUSES = [
  'confirmed',
  'waitlisted',
  'cancelled',
] as const;

export type EventBookingStatus = (typeof EVENT_BOOKING_STATUSES)[number];
