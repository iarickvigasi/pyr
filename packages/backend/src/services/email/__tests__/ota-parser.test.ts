import { describe, it, expect, beforeAll } from 'vitest';
import { parseOtaEmail, registerOtaParser } from '../ota-parser.js';
import type { OtaBookingData, OtaParser } from '../ota-parser.js';
import { tripaneerParser } from '../ota-parsers/tripaneer.parser.js';

// ─── Ensure Tripaneer parser is registered ──────────────────

beforeAll(() => {
  // Import the registration side-effect module
  // This registers the tripaneer parser with the registry
  registerOtaParser(tripaneerParser);
});

// ─── Test 1: Full Tripaneer booking email ───────────────────

describe('OTA Parser - Tripaneer full booking', () => {
  it('extracts all fields from a complete Tripaneer booking email', () => {
    const html = `
      <div>
        <h2>New Booking Notification</h2>
        <p>Guest name: Anna Schmidt</p>
        <p>Email: anna@example.com</p>
        <p>Check-in: March 15, 2026</p>
        <p>Check-out: March 19, 2026</p>
        <p>Package: 4-Day Retreat</p>
        <p>Total: EUR 850.00</p>
        <p>Booking ID: TR-12345</p>
      </div>
    `;

    const result = parseOtaEmail(
      'noreply@tripaneer.com',
      'New Booking: Anna Schmidt',
      html,
      '',
    );

    expect(result).not.toBeNull();
    expect(result!.guestName).toBe('Anna Schmidt');
    expect(result!.guestEmail).toBe('anna@example.com');
    expect(result!.checkIn).toBe('March 15, 2026');
    expect(result!.checkOut).toBe('March 19, 2026');
    expect(result!.packageName).toBe('4-Day Retreat');
    expect(result!.totalPrice).toBe(85000);
    expect(result!.otaPlatform).toBe('tripaneer');
    expect(result!.otaReferenceId).toBe('TR-12345');
    expect(result!.needsReview).toBe(false);
    expect(result!.parseErrors).toEqual([]);
  });
});

// ─── Test 2: BookYogaRetreats email with partial fields ─────

describe('OTA Parser - BookYogaRetreats partial booking', () => {
  it('extracts available fields and flags needsReview for missing dates', () => {
    const html = `
      <div>
        <p>Name: Max Weber</p>
        <p>Email: max@example.com</p>
        <p>Package: 7-Day Wellness Retreat</p>
      </div>
    `;

    const result = parseOtaEmail(
      'bookings@bookyogaretreats.com',
      'Booking Inquiry',
      html,
      '',
    );

    expect(result).not.toBeNull();
    expect(result!.guestName).toBe('Max Weber');
    expect(result!.guestEmail).toBe('max@example.com');
    expect(result!.checkIn).toBeNull();
    expect(result!.checkOut).toBeNull();
    expect(result!.packageName).toBe('7-Day Wellness Retreat');
    expect(result!.needsReview).toBe(true);
    expect(result!.parseErrors).toContain('checkIn');
    expect(result!.parseErrors).toContain('checkOut');
  });
});

// ─── Test 3: Non-OTA domain returns null ────────────────────

describe('OTA Parser - Non-OTA domain', () => {
  it('returns null for email from non-OTA domain', () => {
    const result = parseOtaEmail(
      'guest@gmail.com',
      'I want to book a retreat',
      '<p>Hello</p>',
      'Hello',
    );

    expect(result).toBeNull();
  });
});

// ─── Test 4: Tripaneer email with minimal info ──────────────

describe('OTA Parser - Minimal info (name only)', () => {
  it('extracts only name and flags all critical fields as missing', () => {
    const html = `
      <div>
        <p>Customer: Lisa Mueller</p>
      </div>
    `;

    const result = parseOtaEmail(
      'noreply@tripaneer.com',
      'Booking Notification',
      html,
      '',
    );

    expect(result).not.toBeNull();
    expect(result!.guestName).toBe('Lisa Mueller');
    expect(result!.needsReview).toBe(true);
    expect(result!.parseErrors).toContain('guestEmail');
    expect(result!.parseErrors).toContain('checkIn');
    expect(result!.parseErrors).toContain('checkOut');
  });
});

// ─── Test 5: canParse domain matching ───────────────────────

describe('OTA Parser - canParse domain matching', () => {
  it('matches tripaneer.com domain', () => {
    expect(tripaneerParser.canParse('noreply@tripaneer.com', '')).toBe(true);
  });

  it('matches bookyogaretreats.com domain', () => {
    expect(tripaneerParser.canParse('bookings@bookyogaretreats.com', '')).toBe(true);
  });

  it('does not match booking.com domain', () => {
    expect(tripaneerParser.canParse('noreply@booking.com', '')).toBe(false);
  });

  it('does not match gmail.com domain', () => {
    expect(tripaneerParser.canParse('user@gmail.com', '')).toBe(false);
  });
});

// ─── Test 6: Price extraction formats ───────────────────────

describe('OTA Parser - Price extraction', () => {
  it('extracts EUR 1,250.00 format', () => {
    const html = '<p>Guest name: Test</p><p>Total: EUR 1,250.00</p>';
    const result = parseOtaEmail('noreply@tripaneer.com', 'Booking', html, '');
    expect(result).not.toBeNull();
    expect(result!.totalPrice).toBe(125000);
  });

  it('extracts euro symbol format', () => {
    const html = '<p>Guest name: Test</p><p>Price: \u20AC850</p>';
    const result = parseOtaEmail('noreply@tripaneer.com', 'Booking', html, '');
    expect(result).not.toBeNull();
    expect(result!.totalPrice).toBe(85000);
  });

  it('returns null totalPrice when no price found', () => {
    const html = '<p>Guest name: Test</p><p>No pricing info</p>';
    const result = parseOtaEmail('noreply@tripaneer.com', 'Booking', html, '');
    expect(result).not.toBeNull();
    expect(result!.totalPrice).toBeNull();
  });
});

// ─── Test 7: Date extraction formats ────────────────────────

describe('OTA Parser - Date extraction', () => {
  it('extracts "Month DD, YYYY" format', () => {
    const html = '<p>Guest name: Test</p><p>Check-in: March 15, 2026</p><p>Check-out: March 19, 2026</p>';
    const result = parseOtaEmail('noreply@tripaneer.com', 'Booking', html, '');
    expect(result).not.toBeNull();
    expect(result!.checkIn).toBe('March 15, 2026');
    expect(result!.checkOut).toBe('March 19, 2026');
  });

  it('extracts "DD/MM/YYYY" format', () => {
    const html = '<p>Guest name: Test</p><p>Check-in: 15/03/2026</p><p>Check-out: 19/03/2026</p>';
    const result = parseOtaEmail('noreply@tripaneer.com', 'Booking', html, '');
    expect(result).not.toBeNull();
    expect(result!.checkIn).toBeTruthy();
    expect(result!.checkOut).toBeTruthy();
  });

  it('extracts "YYYY-MM-DD" format', () => {
    const html = '<p>Guest name: Test</p><p>Check-in: 2026-03-15</p><p>Check-out: 2026-03-19</p>';
    const result = parseOtaEmail('noreply@tripaneer.com', 'Booking', html, '');
    expect(result).not.toBeNull();
    expect(result!.checkIn).toBeTruthy();
    expect(result!.checkOut).toBeTruthy();
  });
});

// ─── Test 8: Registry pattern ───────────────────────────────

describe('OTA Parser - Registry pattern', () => {
  it('registerOtaParser adds parser that parseOtaEmail can use', () => {
    const customParser: OtaParser = {
      platform: 'custom-test',
      canParse: (addr: string) => addr.endsWith('@custom-ota.com'),
      parse: () => ({
        guestName: 'Custom Guest',
        guestEmail: null,
        guestPhone: null,
        checkIn: null,
        checkOut: null,
        packageName: null,
        totalPrice: null,
        currency: 'EUR',
        otaPlatform: 'custom-test',
        otaReferenceId: null,
        rawFields: {},
        needsReview: true,
        parseErrors: ['guestEmail', 'checkIn', 'checkOut'],
      }),
    };

    registerOtaParser(customParser);

    const result = parseOtaEmail('booking@custom-ota.com', 'Test', '', '');
    expect(result).not.toBeNull();
    expect(result!.otaPlatform).toBe('custom-test');
    expect(result!.guestName).toBe('Custom Guest');
  });

  it('returns null when no parser matches', () => {
    const result = parseOtaEmail('nobody@unknown.com', 'Test', '', '');
    expect(result).toBeNull();
  });
});
