import { describe, it, expect } from 'vitest';
import {
  buildBookingVevent,
  buildEventVevent,
  formatEventType,
  EVENT_TYPE_LABELS,
  VILLA_ADDRESS,
  TIMEZONE,
  type BookingVeventParams,
  type EventVeventParams,
} from '../ical-builder.js';

// ─── Helpers ────────────────────────────────────────────────

function makeBookingParams(overrides: Partial<BookingVeventParams> = {}): BookingVeventParams {
  return {
    uid: 'pyr-booking-test-1',
    guestName: 'Anna Schmidt',
    roomName: 'Sea View Suite (Room 1)',
    guestEmail: 'anna@example.com',
    guestPhone: '+49 170 1234567',
    totalPrice: 120000, // 1200.00 EUR
    paymentStatus: 'Unpaid',
    bookingSource: 'website',
    checkIn: new Date('2026-03-15'),
    checkOut: new Date('2026-03-18'),
    isCancelled: false,
    sequence: 0,
    ...overrides,
  };
}

function makeEventParams(overrides: Partial<EventVeventParams> = {}): EventVeventParams {
  return {
    uid: 'pyr-event-test-1',
    eventType: 'puppy_yoga',
    confirmedCount: 6,
    capacity: 8,
    registeredGuests: ['Anna Schmidt', 'John Doe', 'Maria Garcia', 'Lisa M\u00fcller', 'Tom Brown', 'Eve White'],
    location: 'Rooftop',
    date: new Date('2026-03-20'),
    time: '09:00',
    isCancelled: false,
    sequence: 0,
    ...overrides,
  };
}

// ─── buildBookingVevent Tests ───────────────────────────────

describe('buildBookingVevent', () => {
  it('generates all-day VEVENT with correct title format', () => {
    const output = buildBookingVevent(makeBookingParams());
    // Title should be "Guest Name \u2014 Room Name" (em dash)
    expect(output).toContain('Anna Schmidt');
    expect(output).toContain('Sea View Suite (Room 1)');
    // Verify SUMMARY line contains the guest and room
    expect(output).toMatch(/SUMMARY:.*Anna Schmidt.*Sea View Suite/);
  });

  it('includes guest contact and payment info in description', () => {
    const output = buildBookingVevent(makeBookingParams());
    expect(output).toContain('anna@example.com');
    expect(output).toContain('+49 170 1234567');
    expect(output).toContain('Sea View Suite (Room 1)');
    expect(output).toContain('Unpaid');
    expect(output).toContain('website');
  });

  it('formats price as EUR from cents', () => {
    const output = buildBookingVevent(makeBookingParams({ totalPrice: 120000 }));
    // 120000 cents = 1200.00 EUR
    expect(output).toContain('1200.00');
  });

  it('uses villa address as location', () => {
    const output = buildBookingVevent(makeBookingParams());
    // ical-generator escapes commas per RFC 5545 (backslash before comma)
    const escapedAddress = VILLA_ADDRESS.replace(/,/g, '\\,');
    expect(output).toContain(escapedAddress);
  });

  it('sets DTEND to checkout + 1 day for all-day events', () => {
    // Booking Mar 15-18, DTEND should be Mar 19 (non-inclusive end, checkout day included)
    const output = buildBookingVevent(makeBookingParams({
      checkIn: new Date('2026-03-15'),
      checkOut: new Date('2026-03-18'),
    }));
    // ical-generator emits VALUE=DATE format for all-day events: DTEND;VALUE=DATE:20260319
    expect(output).toMatch(/DTEND.*20260319/);
    expect(output).toMatch(/DTSTART.*20260315/);
  });

  it('prefixes cancelled booking title with [CANCELLED]', () => {
    const output = buildBookingVevent(makeBookingParams({ isCancelled: true }));
    expect(output).toMatch(/SUMMARY:.*\[CANCELLED\].*Anna Schmidt/);
  });

  it('increments SEQUENCE on update', () => {
    const output = buildBookingVevent(makeBookingParams({ sequence: 2 }));
    expect(output).toContain('SEQUENCE:2');
  });

  it('handles null phone gracefully', () => {
    const output = buildBookingVevent(makeBookingParams({ guestPhone: null }));
    // Should not contain "Phone:" line
    expect(output).not.toMatch(/Phone:/);
    // Should still contain email
    expect(output).toContain('anna@example.com');
  });

  it('handles null booking source gracefully', () => {
    const output = buildBookingVevent(makeBookingParams({ bookingSource: null }));
    // Should not contain "Source:" line
    expect(output).not.toMatch(/Source:/);
    // Should still contain other fields
    expect(output).toContain('anna@example.com');
  });

  it('generates valid iCalendar structure', () => {
    const output = buildBookingVevent(makeBookingParams());
    expect(output).toContain('BEGIN:VCALENDAR');
    expect(output).toContain('END:VCALENDAR');
    expect(output).toContain('BEGIN:VEVENT');
    expect(output).toContain('END:VEVENT');
    expect(output).toContain('PRODID');
  });
});

// ─── buildEventVevent Tests ─────────────────────────────────

describe('buildEventVevent', () => {
  it('generates timed VEVENT with correct title format', () => {
    const output = buildEventVevent(makeEventParams());
    // Title: "Puppy Yoga (6/8 booked)"
    expect(output).toMatch(/SUMMARY:.*Puppy Yoga \(6\/8 booked\)/);
  });

  it('includes registered guest names in description', () => {
    const output = buildEventVevent(makeEventParams());
    expect(output).toContain('Anna Schmidt');
    expect(output).toContain('John Doe');
    expect(output).toContain('Maria Garcia');
    expect(output).toContain('Registered guests');
  });

  it('uses event-specific location', () => {
    const output = buildEventVevent(makeEventParams({ location: 'Rooftop' }));
    expect(output).toContain('Rooftop');
    // Should NOT contain the villa address for events
    expect(output).not.toContain(VILLA_ADDRESS);
  });

  it('calculates correct end time from duration', () => {
    // puppy_yoga = 90 min, start 09:00 -> end 10:30
    const output = buildEventVevent(makeEventParams({
      eventType: 'puppy_yoga',
      time: '09:00',
    }));
    // The DTSTART and DTEND should reflect 09:00 and 10:30
    // ical-generator formats timed events with TZID
    expect(output).toMatch(/DTSTART.*T090000/);
    expect(output).toMatch(/DTEND.*T103000/);
  });

  it('includes timezone Europe/Nicosia', () => {
    const output = buildEventVevent(makeEventParams());
    expect(output).toContain(TIMEZONE);
  });

  it('prefixes cancelled event title with [CANCELLED]', () => {
    const output = buildEventVevent(makeEventParams({ isCancelled: true }));
    expect(output).toMatch(/SUMMARY:.*\[CANCELLED\].*Puppy Yoga/);
  });

  it('handles zero registrations', () => {
    const output = buildEventVevent(makeEventParams({
      confirmedCount: 0,
      registeredGuests: [],
    }));
    expect(output).toContain('No registrations yet');
    expect(output).toMatch(/SUMMARY:.*\(0\/8 booked\)/);
  });

  it('formats event type labels correctly', () => {
    // beach_walk should become "Puppy Beach Walk"
    const output = buildEventVevent(makeEventParams({ eventType: 'beach_walk' }));
    expect(output).toMatch(/SUMMARY:.*Puppy Beach Walk/);
  });

  it('uses correct duration for beach_walk (120 min)', () => {
    // beach_walk = 120 min, start 14:00 -> end 16:00
    const output = buildEventVevent(makeEventParams({
      eventType: 'beach_walk',
      time: '14:00',
    }));
    expect(output).toMatch(/DTSTART.*T140000/);
    expect(output).toMatch(/DTEND.*T160000/);
  });

  it('uses correct duration for coffee_cake_cuddles (60 min)', () => {
    // coffee_cake_cuddles = 60 min, start 15:00 -> end 16:00
    const output = buildEventVevent(makeEventParams({
      eventType: 'coffee_cake_cuddles',
      time: '15:00',
    }));
    expect(output).toMatch(/DTSTART.*T150000/);
    expect(output).toMatch(/DTEND.*T160000/);
  });

  it('generates valid iCalendar structure', () => {
    const output = buildEventVevent(makeEventParams());
    expect(output).toContain('BEGIN:VCALENDAR');
    expect(output).toContain('END:VCALENDAR');
    expect(output).toContain('BEGIN:VEVENT');
    expect(output).toContain('END:VEVENT');
  });

  it('omits location when null', () => {
    const output = buildEventVevent(makeEventParams({ location: null }));
    // Should not have LOCATION line
    expect(output).not.toMatch(/^LOCATION:/m);
  });
});

// ─── formatEventType Tests ──────────────────────────────────

describe('formatEventType', () => {
  it('maps puppy_yoga to "Puppy Yoga"', () => {
    expect(formatEventType('puppy_yoga')).toBe('Puppy Yoga');
  });

  it('maps beach_walk to "Puppy Beach Walk"', () => {
    expect(formatEventType('beach_walk')).toBe('Puppy Beach Walk');
  });

  it('maps coffee_cake_cuddles to "Coffee, Cake & Cuddles"', () => {
    expect(formatEventType('coffee_cake_cuddles')).toBe('Coffee, Cake & Cuddles');
  });

  it('all known event types have labels', () => {
    for (const [type, label] of Object.entries(EVENT_TYPE_LABELS)) {
      expect(formatEventType(type)).toBe(label);
    }
  });

  it('falls back to titleCase for unknown event type', () => {
    expect(formatEventType('sunset_meditation')).toBe('Sunset Meditation');
  });

  it('handles single-word unknown type', () => {
    expect(formatEventType('retreat')).toBe('Retreat');
  });
});
