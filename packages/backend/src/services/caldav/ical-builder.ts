import ical from 'ical-generator';

// ─── Constants ──────────────────────────────────────────────

export const VILLA_ADDRESS = 'Puppy Yoga Retreat, Peyia 8560, Paphos, Cyprus';
export const PRODID = '-//Puppy Yoga Retreat//PYR Calendar Sync//EN';
export const TIMEZONE = 'Europe/Nicosia';

/**
 * Human-readable labels for event types.
 * Maps DB enum values to display names for calendar titles.
 */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  puppy_yoga: 'Puppy Yoga',
  beach_walk: 'Puppy Beach Walk',
  coffee_cake_cuddles: 'Coffee, Cake & Cuddles',
};

/**
 * Default durations in minutes per event type.
 * Used to compute DTEND for timed events.
 */
export const EVENT_DURATIONS: Record<string, number> = {
  puppy_yoga: 90,
  beach_walk: 120,
  coffee_cake_cuddles: 60,
};

// ─── Helpers ────────────────────────────────────────────────

/**
 * Get human-readable label for an event type.
 * Falls back to title-casing the raw type string.
 */
export function formatEventType(type: string): string {
  if (EVENT_TYPE_LABELS[type]) {
    return EVENT_TYPE_LABELS[type];
  }
  // Fallback: title-case the type (e.g. "beach_walk" -> "Beach Walk")
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get default duration in minutes for an event type.
 * Falls back to 60 minutes for unknown types.
 */
export function getEventDuration(type: string): number {
  return EVENT_DURATIONS[type] ?? 60;
}

// ─── Booking VEVENT Builder ─────────────────────────────────

export interface BookingVeventParams {
  uid: string;
  guestNames: string[];
  roomName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  totalPrice: number; // integer cents
  paymentStatus: string; // 'Paid' | 'Unpaid' | 'Partial'
  bookingSource: string | null;
  checkIn: Date;
  checkOut: Date;
  isCancelled: boolean;
  sequence: number;
}

/**
 * Generate an all-day VEVENT for a booking per CONTEXT.md decisions:
 * - Title: "Guest Name -- Room Name" (or "[CANCELLED] ..." if cancelled)
 * - Description: guest contact, room, total price, payment status, source
 * - Location: villa address
 * - All-day event spanning check-in through check-out (inclusive)
 *
 * NOTE: Per RFC 5545, DTEND is non-inclusive for DATE values. The user
 * decided the check-out day should be included in the event span.
 * We add +1 day to checkOut before passing to ical-generator so the
 * event shows through the check-out day in Apple Calendar.
 */
export function buildBookingVevent(params: BookingVeventParams): string {
  const cal = ical({ prodId: PRODID });

  const guestName = params.guestNames.join(', ') || 'Unknown Guest';
  const title = params.isCancelled
    ? `[CANCELLED] ${guestName} \u2014 ${params.roomName}`
    : `${guestName} \u2014 ${params.roomName}`;

  const descLines: string[] = [];
  if (params.guestEmail) descLines.push(`Email: ${params.guestEmail}`);
  if (params.guestPhone) descLines.push(`Phone: ${params.guestPhone}`);
  descLines.push(`Room: ${params.roomName}`);
  descLines.push(
    `Total: \u20AC${(params.totalPrice / 100).toFixed(2)} (${params.paymentStatus})`,
  );
  if (params.bookingSource) descLines.push(`Source: ${params.bookingSource}`);

  // Add +1 day to checkOut for inclusive end date per RFC 5545 all-day DTEND rule
  const endDate = new Date(params.checkOut);
  endDate.setDate(endDate.getDate() + 1);

  cal.createEvent({
    id: params.uid,
    summary: title,
    description: descLines.join('\n'),
    location: VILLA_ADDRESS,
    start: params.checkIn,
    end: endDate,
    allDay: true,
    sequence: params.sequence,
  });

  return cal.toString();
}

// ─── Event VEVENT Builder ───────────────────────────────────

export interface EventVeventParams {
  uid: string;
  eventType: string;
  confirmedCount: number;
  capacity: number;
  registeredGuests: string[];
  location: string | null;
  date: Date;
  time: string; // "HH:MM"
  isCancelled: boolean;
  sequence: number;
}

/**
 * Generate a timed VEVENT for a standalone event per CONTEXT.md decisions:
 * - Title: "Event Type (X/Y booked)" (or "[CANCELLED] ..." if cancelled)
 * - Description: list of registered guest names
 * - Location: event-specific location (Rooftop, Beach, etc.)
 * - Timed event with duration derived from event type
 * - Timezone: Europe/Nicosia
 */
export function buildEventVevent(params: EventVeventParams): string {
  const cal = ical({ prodId: PRODID });

  const titleType = formatEventType(params.eventType);
  const title = params.isCancelled
    ? `[CANCELLED] ${titleType} (${params.confirmedCount}/${params.capacity} booked)`
    : `${titleType} (${params.confirmedCount}/${params.capacity} booked)`;

  const description =
    params.registeredGuests.length > 0
      ? `Registered guests:\n${params.registeredGuests.map((n) => `- ${n}`).join('\n')}`
      : 'No registrations yet';

  // Parse time string and build start/end dates
  const [hours, minutes] = params.time.split(':').map(Number);
  const start = new Date(params.date);
  start.setHours(hours ?? 0, minutes ?? 0, 0, 0);

  const durationMinutes = getEventDuration(params.eventType);
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  cal.createEvent({
    id: params.uid,
    summary: title,
    description,
    location: params.location ?? undefined,
    start,
    end,
    sequence: params.sequence,
    timezone: TIMEZONE,
  });

  return cal.toString();
}
