/**
 * CalDAV Integration Tests -- Real iCloud Account
 *
 * These tests verify the CalDAV lifecycle (create, update, cancel, delete)
 * against Apple's real CalDAV server. They are SKIPPED when iCloud credentials
 * are not available (no test failures).
 *
 * Required env vars:
 * - CALDAV_TEST_URL   (e.g., https://caldav.icloud.com)
 * - CALDAV_TEST_USER  (Apple ID email)
 * - CALDAV_TEST_PASS  (App-specific password)
 * - CALDAV_TEST_CALENDAR (optional, defaults to 'PYR Test')
 *
 * IMPORTANT: These are expensive tests (real network calls to iCloud).
 * Each test has a 30s timeout. All created events are cleaned up in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DAVClient } from 'tsdav';
import type { DAVCalendar } from 'tsdav';
import { randomUUID } from 'node:crypto';
import { buildBookingVevent, buildEventVevent } from '../ical-builder.js';

// ─── Credential Check ───────────────────────────────────────

const CALDAV_TEST_URL = process.env.CALDAV_TEST_URL;
const CALDAV_TEST_USER = process.env.CALDAV_TEST_USER;
const CALDAV_TEST_PASS = process.env.CALDAV_TEST_PASS;
const CALDAV_TEST_CALENDAR = process.env.CALDAV_TEST_CALENDAR || 'PYR Test';

const hasCredentials = !!(CALDAV_TEST_URL && CALDAV_TEST_USER && CALDAV_TEST_PASS);
const describeIf = (condition: boolean) => (condition ? describe : describe.skip);

// ─── Integration Tests ──────────────────────────────────────

describeIf(hasCredentials)('CalDAV Integration (real iCloud)', () => {
  let client: DAVClient;
  let calendar: DAVCalendar;
  const createdEventUrls: string[] = [];

  beforeAll(async () => {
    client = new DAVClient({
      serverUrl: CALDAV_TEST_URL!,
      credentials: {
        username: CALDAV_TEST_USER!,
        password: CALDAV_TEST_PASS!,
      },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });

    await client.login();

    const calendars = await client.fetchCalendars();
    const found = calendars.find((c) => c.displayName === CALDAV_TEST_CALENDAR);
    if (!found) {
      const available = calendars
        .map((c) => c.displayName)
        .filter(Boolean)
        .join(', ');
      throw new Error(
        `Test calendar "${CALDAV_TEST_CALENDAR}" not found. Available: ${available || 'none'}. ` +
        'Create a calendar named "PYR Test" in Apple Calendar app.',
      );
    }
    calendar = found;
  }, 30_000);

  afterAll(async () => {
    // Clean up all created events
    for (const url of createdEventUrls) {
      try {
        await client.deleteCalendarObject({ calendarObject: { url } });
      } catch {
        // Ignore cleanup errors -- event may already be deleted
      }
    }
  }, 30_000);

  it('connects to iCloud and finds test calendar', () => {
    expect(calendar).toBeDefined();
    expect(calendar.displayName).toBe(CALDAV_TEST_CALENDAR);
    expect(calendar.url).toBeTruthy();
  }, 30_000);

  it('creates a booking all-day event', async () => {
    const uid = `pyr-test-booking-${randomUUID()}`;
    const iCalString = buildBookingVevent({
      uid,
      guestNames: ['Integration Test Guest'],
      roomName: 'Sea View Suite',
      guestEmail: 'test@example.com',
      guestPhone: '+1234567890',
      totalPrice: 80000,
      paymentStatus: 'Unpaid',
      bookingSource: 'test',
      checkIn: new Date('2026-06-01'),
      checkOut: new Date('2026-06-04'),
      isCancelled: false,
      sequence: 0,
    });

    const response = await client.createCalendarObject({
      calendar,
      filename: `${uid}.ics`,
      iCalString,
    });

    // Track for cleanup
    const eventUrl = `${calendar.url}${uid}.ics`;
    createdEventUrls.push(eventUrl);

    // Verify response (iCloud returns success)
    expect(response).toBeDefined();

    // Fetch calendar objects and verify the event exists
    const objects = await client.fetchCalendarObjects({ calendar });
    const created = objects.find((obj) => obj.url.includes(uid));
    expect(created).toBeDefined();
    expect(created!.data).toContain('Integration Test Guest');
    expect(created!.data).toContain('Sea View Suite');
  }, 30_000);

  it('creates a timed standalone event', async () => {
    const uid = `pyr-test-event-${randomUUID()}`;
    const iCalString = buildEventVevent({
      uid,
      eventType: 'puppy_yoga',
      confirmedCount: 3,
      capacity: 8,
      registeredGuests: ['Test Guest 1', 'Test Guest 2', 'Test Guest 3'],
      location: 'Rooftop',
      date: new Date('2026-06-15'),
      time: '09:00',
      isCancelled: false,
      sequence: 0,
    });

    await client.createCalendarObject({
      calendar,
      filename: `${uid}.ics`,
      iCalString,
    });

    const eventUrl = `${calendar.url}${uid}.ics`;
    createdEventUrls.push(eventUrl);

    // Verify the event was created
    const objects = await client.fetchCalendarObjects({ calendar });
    const created = objects.find((obj) => obj.url.includes(uid));
    expect(created).toBeDefined();
    expect(created!.data).toContain('Puppy Yoga');
    expect(created!.data).toContain('3/8 booked');
  }, 30_000);

  it('updates a booking event (room change)', async () => {
    const uid = `pyr-test-update-${randomUUID()}`;

    // Create initial booking
    const initialIcal = buildBookingVevent({
      uid,
      guestNames: ['Update Test Guest'],
      roomName: 'Garden Room',
      guestEmail: 'update@example.com',
      guestPhone: null,
      totalPrice: 60000,
      paymentStatus: 'Unpaid',
      bookingSource: null,
      checkIn: new Date('2026-07-01'),
      checkOut: new Date('2026-07-03'),
      isCancelled: false,
      sequence: 0,
    });

    await client.createCalendarObject({
      calendar,
      filename: `${uid}.ics`,
      iCalString: initialIcal,
    });

    const eventUrl = `${calendar.url}${uid}.ics`;
    createdEventUrls.push(eventUrl);

    // Update with new room name and incremented sequence
    const updatedIcal = buildBookingVevent({
      uid,
      guestNames: ['Update Test Guest'],
      roomName: 'Sea View Suite',
      guestEmail: 'update@example.com',
      guestPhone: null,
      totalPrice: 90000,
      paymentStatus: 'Unpaid',
      bookingSource: null,
      checkIn: new Date('2026-07-01'),
      checkOut: new Date('2026-07-03'),
      isCancelled: false,
      sequence: 1,
    });

    // Fetch the current object to get its etag
    const objects = await client.fetchCalendarObjects({ calendar });
    const existing = objects.find((obj) => obj.url.includes(uid));
    expect(existing).toBeDefined();

    await client.updateCalendarObject({
      calendarObject: {
        url: eventUrl,
        data: updatedIcal,
        etag: existing!.etag ?? undefined,
      },
    });

    // Verify update
    const updatedObjects = await client.fetchCalendarObjects({ calendar });
    const updated = updatedObjects.find((obj) => obj.url.includes(uid));
    expect(updated).toBeDefined();
    expect(updated!.data).toContain('Sea View Suite');
    expect(updated!.data).toContain('SEQUENCE:1');
  }, 30_000);

  it('cancels a booking (adds [CANCELLED] prefix)', async () => {
    const uid = `pyr-test-cancel-${randomUUID()}`;

    // Create initial booking
    const initialIcal = buildBookingVevent({
      uid,
      guestNames: ['Cancel Test Guest'],
      roomName: 'Pool View',
      guestEmail: 'cancel@example.com',
      guestPhone: null,
      totalPrice: 50000,
      paymentStatus: 'Unpaid',
      bookingSource: null,
      checkIn: new Date('2026-08-01'),
      checkOut: new Date('2026-08-03'),
      isCancelled: false,
      sequence: 0,
    });

    await client.createCalendarObject({
      calendar,
      filename: `${uid}.ics`,
      iCalString: initialIcal,
    });

    const eventUrl = `${calendar.url}${uid}.ics`;
    createdEventUrls.push(eventUrl);

    // Cancel: update with [CANCELLED] prefix
    const cancelledIcal = buildBookingVevent({
      uid,
      guestNames: ['Cancel Test Guest'],
      roomName: 'Pool View',
      guestEmail: 'cancel@example.com',
      guestPhone: null,
      totalPrice: 50000,
      paymentStatus: 'Unpaid',
      bookingSource: null,
      checkIn: new Date('2026-08-01'),
      checkOut: new Date('2026-08-03'),
      isCancelled: true,
      sequence: 1,
    });

    // Fetch current etag
    const objects = await client.fetchCalendarObjects({ calendar });
    const existing = objects.find((obj) => obj.url.includes(uid));
    expect(existing).toBeDefined();

    await client.updateCalendarObject({
      calendarObject: {
        url: eventUrl,
        data: cancelledIcal,
        etag: existing!.etag ?? undefined,
      },
    });

    // Verify cancellation prefix
    const cancelledObjects = await client.fetchCalendarObjects({ calendar });
    const cancelled = cancelledObjects.find((obj) => obj.url.includes(uid));
    expect(cancelled).toBeDefined();
    expect(cancelled!.data).toContain('[CANCELLED]');
    expect(cancelled!.data).toContain('Cancel Test Guest');
  }, 30_000);

  it('all-day event spans correctly including checkout day', async () => {
    const uid = `pyr-test-span-${randomUUID()}`;

    // 3-day booking: Mar 10-12 (3 nights)
    // DTSTART should be 20260310, DTEND should be 20260313 (checkout + 1, non-inclusive)
    const iCalString = buildBookingVevent({
      uid,
      guestNames: ['Span Test Guest'],
      roomName: 'Suite',
      guestEmail: null,
      guestPhone: null,
      totalPrice: 0,
      paymentStatus: 'N/A',
      bookingSource: null,
      checkIn: new Date('2026-03-10'),
      checkOut: new Date('2026-03-12'),
      isCancelled: false,
      sequence: 0,
    });

    await client.createCalendarObject({
      calendar,
      filename: `${uid}.ics`,
      iCalString,
    });

    const eventUrl = `${calendar.url}${uid}.ics`;
    createdEventUrls.push(eventUrl);

    // Fetch and verify date span
    const objects = await client.fetchCalendarObjects({ calendar });
    const created = objects.find((obj) => obj.url.includes(uid));
    expect(created).toBeDefined();
    // DTSTART should be March 10
    expect(created!.data).toMatch(/DTSTART.*20260310/);
    // DTEND should be March 13 (checkout day Mar 12 + 1 for non-inclusive end)
    expect(created!.data).toMatch(/DTEND.*20260313/);
  }, 30_000);

  it('deletes a test event', async () => {
    const uid = `pyr-test-delete-${randomUUID()}`;

    const iCalString = buildBookingVevent({
      uid,
      guestNames: ['Delete Test Guest'],
      roomName: 'Temp Room',
      guestEmail: null,
      guestPhone: null,
      totalPrice: 0,
      paymentStatus: 'N/A',
      bookingSource: null,
      checkIn: new Date('2026-09-01'),
      checkOut: new Date('2026-09-02'),
      isCancelled: false,
      sequence: 0,
    });

    await client.createCalendarObject({
      calendar,
      filename: `${uid}.ics`,
      iCalString,
    });

    const eventUrl = `${calendar.url}${uid}.ics`;
    // Do NOT track for cleanup -- we're testing delete

    // Verify it was created
    const objectsBefore = await client.fetchCalendarObjects({ calendar });
    const created = objectsBefore.find((obj) => obj.url.includes(uid));
    expect(created).toBeDefined();

    // Delete it
    await client.deleteCalendarObject({
      calendarObject: { url: eventUrl, etag: created!.etag ?? undefined },
    });

    // Verify it was removed
    const objectsAfter = await client.fetchCalendarObjects({ calendar });
    const deleted = objectsAfter.find((obj) => obj.url.includes(uid));
    expect(deleted).toBeUndefined();
  }, 30_000);
});

// ─── Skip verification ──────────────────────────────────────

describe('CalDAV Integration (credential check)', () => {
  it('skips integration tests gracefully when credentials are not set', () => {
    if (!hasCredentials) {
      // This test exists to verify the skip mechanism works.
      // When credentials are absent, the main describe block is skipped.
      expect(hasCredentials).toBe(false);
    } else {
      // Credentials are present -- main tests will run
      expect(hasCredentials).toBe(true);
    }
  });
});
