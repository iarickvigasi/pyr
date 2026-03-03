import { describe, it, expect } from 'vitest';
import {
  classifyEmail,
  classifyWithAi,
  isSystemSender,
} from '../email-classifier.js';
import { detectLanguage } from '../language-detector.js';

describe('classifyEmail (rules fallback)', () => {
  it('classifies Tripaneer sender as ota_tripaneer', () => {
    const result = classifyEmail({ address: 'booking@tripaneer.com' }, 'New booking');
    expect(result.category).toBe('ota_tripaneer');
    expect(result.source).toBe('rules');
  });

  it('classifies BookYogaRetreats sender as ota_bookyogaretreats', () => {
    const result = classifyEmail({ address: 'bookings@bookyogaretreats.com' }, 'Inquiry');
    expect(result.category).toBe('ota_bookyogaretreats');
  });

  it('classifies other OTA platforms as ota_other', () => {
    const result = classifyEmail({ address: 'bookings@getyourguide.com' }, 'Reservation');
    expect(result.category).toBe('ota_other');
  });

  it('classifies newsletters as other', () => {
    const result = classifyEmail({ address: 'newsletter@example.com' }, 'Weekly digest');
    expect(result.category).toBe('other');
  });

  it('classifies system messages as other', () => {
    const result = classifyEmail({ address: 'postmaster@example.com' }, 'Delivery notification');
    expect(result.category).toBe('other');
  });

  it('defaults to conversation when no rule matches', () => {
    const result = classifyEmail({ address: 'guest@example.com' }, 'Can I book for April?');
    expect(result.category).toBe('conversation');
  });
});

describe('detectLanguage', () => {
  it('detects German text as de', () => {
    expect(detectLanguage('Hallo, ich möchte gerne einen Retreat buchen.')).toBe('de');
  });

  it('detects English text as en', () => {
    expect(detectLanguage('Hello, I would like to book a retreat in April.')).toBe('en');
  });
});

describe('classifyWithAi compatibility', () => {
  it('returns deterministic rules-based fallback', async () => {
    const result = await classifyWithAi('Hello', { from: 'guest@example.com', subject: 'Question' });
    expect(result.category).toBe('conversation');
    expect(result.source).toBe('rules');
  });
});

describe('isSystemSender', () => {
  it('returns true for OTA senders', () => {
    expect(isSystemSender('booking@tripaneer.com')).toBe(true);
  });

  it('returns true for newsletter/system senders', () => {
    expect(isSystemSender('noreply@example.com')).toBe(true);
    expect(isSystemSender('postmaster@example.com')).toBe(true);
  });

  it('returns false for regular senders', () => {
    expect(isSystemSender('guest@example.com')).toBe(false);
  });
});
