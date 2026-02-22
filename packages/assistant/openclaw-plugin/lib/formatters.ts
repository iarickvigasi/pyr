/**
 * Pre-format values for tool responses to reduce LLM formatting work.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Format ISO date string to "15 Mar 2026" format.
 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Format ISO date string to "15 Mar 2026, 10:00" format.
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hours}:${minutes}`;
}

/**
 * Format integer cents to "EUR 450.00" format.
 */
export function formatEurCents(cents: number): string {
  return `EUR ${(cents / 100).toFixed(2)}`;
}

/**
 * Human-readable booking status.
 */
export function formatBookingStatus(status: string): string {
  const map: Record<string, string> = {
    inquiry: 'Inquiry',
    confirmed: 'Confirmed',
    checked_in: 'Checked In',
    checked_out: 'Checked Out',
    cancelled: 'Cancelled',
  };
  return map[status] ?? status;
}

/**
 * Human-readable event type.
 */
export function formatEventType(type: string): string {
  const map: Record<string, string> = {
    puppy_yoga: 'Puppy Yoga Class',
    beach_walk: 'Puppy Beach Walk',
    coffee_cake_cuddles: 'Coffee, Cake & Cuddles',
    retreat: 'Retreat',
  };
  return map[type] ?? type;
}

/**
 * Build a relative dashboard URL for an entity.
 */
export function dashboardUrl(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}
