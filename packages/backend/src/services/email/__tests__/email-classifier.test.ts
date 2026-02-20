import { describe, it, expect } from 'vitest';
import {
  classifyEmail,
  classifyWithAi,
  isSystemSender,
  type EmailCategory,
  type ClassificationResult,
} from '../email-classifier.js';
import { detectLanguage } from '../language-detector.js';

// ─── classifyEmail ──────────────────────────────────────────

describe('classifyEmail', () => {
  // OTA domain matching
  it('classifies tripaneer.com as ota_notification', () => {
    const result = classifyEmail({ address: 'booking@tripaneer.com' }, 'New booking');
    expect(result.category).toBe('ota_notification');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.reason).toBeDefined();
  });

  it('classifies bookyogaretreats.com as ota_notification', () => {
    const result = classifyEmail({ address: 'noreply@bookyogaretreats.com' }, 'Inquiry');
    expect(result.category).toBe('ota_notification');
  });

  it('classifies getyourguide.com as ota_notification', () => {
    const result = classifyEmail({ address: 'bookings@getyourguide.com' }, 'New reservation');
    expect(result.category).toBe('ota_notification');
  });

  it('classifies viator.com as ota_notification', () => {
    const result = classifyEmail({ address: 'support@viator.com' }, 'Booking confirmed');
    expect(result.category).toBe('ota_notification');
  });

  it('classifies bookretreats.com as ota_notification', () => {
    const result = classifyEmail({ address: 'info@bookretreats.com' }, 'New inquiry');
    expect(result.category).toBe('ota_notification');
  });

  // Spam/newsletter sender patterns
  it('classifies noreply@ as spam_newsletter', () => {
    const result = classifyEmail({ address: 'noreply@someservice.com' }, 'Weekly digest');
    expect(result.category).toBe('spam_newsletter');
  });

  it('classifies no-reply@ as spam_newsletter', () => {
    const result = classifyEmail({ address: 'no-reply@shop.com' }, 'Your receipt');
    expect(result.category).toBe('spam_newsletter');
  });

  it('classifies newsletter@ as spam_newsletter', () => {
    const result = classifyEmail({ address: 'newsletter@yogajournal.com' }, 'Monthly news');
    expect(result.category).toBe('spam_newsletter');
  });

  it('classifies marketing@ as spam_newsletter', () => {
    const result = classifyEmail({ address: 'marketing@brand.com' }, 'Special offer');
    expect(result.category).toBe('spam_newsletter');
  });

  // Spam subject patterns
  it('classifies subject with "unsubscribe" as spam_newsletter', () => {
    const result = classifyEmail({ address: 'info@random.com' }, 'Click to unsubscribe from our list');
    expect(result.category).toBe('spam_newsletter');
  });

  // System sender patterns
  it('classifies postmaster@ as admin_system', () => {
    const result = classifyEmail({ address: 'postmaster@mail.example.com' }, 'System notice');
    expect(result.category).toBe('admin_system');
  });

  it('classifies mailer-daemon@ as admin_system', () => {
    const result = classifyEmail({ address: 'mailer-daemon@gmail.com' }, 'Undelivered mail');
    expect(result.category).toBe('admin_system');
  });

  // System subject patterns
  it('classifies subject with "delivery notification" as admin_system', () => {
    const result = classifyEmail({ address: 'system@isp.com' }, 'Mail Delivery Notification');
    expect(result.category).toBe('admin_system');
  });

  // Default classification
  it('classifies regular email as guest_inquiry', () => {
    const result = classifyEmail({ address: 'anna@gmail.com' }, 'I want to book a retreat');
    expect(result.category).toBe('guest_inquiry');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.reason).toBeDefined();
  });

  // Result structure
  it('returns confidence and reason on every result', () => {
    const result = classifyEmail({ address: 'test@example.com' }, 'Hello');
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('reason');
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(typeof result.reason).toBe('string');
  });
});

// ─── detectLanguage ─────────────────────────────────────────

describe('detectLanguage', () => {
  it('detects German text as "de"', () => {
    expect(detectLanguage('Hallo, ich möchte gerne einen Retreat buchen. Können Sie mir bitte mehr Informationen schicken?')).toBe('de');
  });

  it('detects English text as "en"', () => {
    expect(detectLanguage('Hello, I would like to book a retreat. Can you please send me more information?')).toBe('en');
  });

  it('returns "en" for very short text (< 20 chars)', () => {
    expect(detectLanguage('Hi there')).toBe('en');
  });

  it('returns "en" for empty string', () => {
    expect(detectLanguage('')).toBe('en');
  });

  it('returns best guess for mixed language text', () => {
    const result = detectLanguage('This is mostly English text with some German words like Buchung and Anfrage mixed in, but overall the text should lean English.');
    expect(['en', 'de']).toContain(result);
  });
});

// ─── classifyWithAi (stub) ──────────────────────────────────

describe('classifyWithAi', () => {
  it('returns guest_inquiry with 0.5 confidence as Phase 4 stub', async () => {
    const result = await classifyWithAi('Some email content', { from: 'test@example.com' });
    expect(result.category).toBe('guest_inquiry');
    expect(result.confidence).toBe(0.5);
    expect(result.reason).toContain('Phase 4');
  });
});

// ─── isSystemSender ─────────────────────────────────────────

describe('isSystemSender', () => {
  it('returns true for OTA senders', () => {
    expect(isSystemSender('booking@tripaneer.com')).toBe(true);
  });

  it('returns true for spam senders', () => {
    expect(isSystemSender('noreply@someservice.com')).toBe(true);
  });

  it('returns true for system senders', () => {
    expect(isSystemSender('mailer-daemon@gmail.com')).toBe(true);
  });

  it('returns false for regular email addresses', () => {
    expect(isSystemSender('anna@gmail.com')).toBe(false);
  });
});
