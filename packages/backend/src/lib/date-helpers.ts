/**
 * Business timezone for Puppy Yoga Retreat.
 * The villa is in Peyia, Cyprus — EET/EEST (UTC+2/+3).
 * All "today" comparisons use this timezone so that Cyprus midnight
 * defines the start/end of a calendar day, not UTC midnight.
 */
export const TZ = 'Europe/Nicosia';

/**
 * Returns a UTC Date at midnight for the given calendar date string 'YYYY-MM-DD'.
 *
 * Used when comparing Date-only fields (checkIn, checkOut) stored as UTC midnight
 * against a Cyprus-local date. Example: `utcMidnight('2026-03-15')` → `2026-03-15T00:00:00.000Z`
 */
export function utcMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * Returns the current date string 'YYYY-MM-DD' in the Cyprus timezone.
 *
 * Use this instead of `new Date().toISOString().slice(0, 10)` to avoid
 * reporting yesterday's date for times between UTC midnight and Cyprus midnight
 * (e.g. 23:00 UTC = 01:00 next day in Cyprus during EEST).
 */
export function nicosiaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}
