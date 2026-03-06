import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BRAND_VOICE_PREFIX,
  GUARDRAILS,
  buildSystemPrompt,
  formatConversationHistory,
  formatGuestProfile,
  formatBookings,
  formatAvailability,
  formatEvents,
  formatFaqs,
} from '../prompts/system.js';
import { CLASSIFICATION_PROMPT, formatClassificationContext } from '../prompts/classification.js';
import { buildDraftContext, type DraftContext } from '../context-builder.js';

// ─── Test data factories ─────────────────────────────────

function makeDraftContext(overrides?: Partial<DraftContext>): DraftContext {
  return {
    conversation: {
      id: 'conv-1',
      subject: 'Retreat inquiry',
      messages: [
        {
          direction: 'in',
          content: 'I would like to book a 4-day retreat in April.',
          sentAt: new Date('2026-03-15T10:00:00Z'),
        },
      ],
    },
    guest: {
      id: 'guest-1',
      name: 'Maria Schmidt',
      email: 'maria@example.com',
      phone: '+49 170 1234567',
      language: 'de',
      dietaryNeeds: 'Vegan',
      notes: 'Returning guest, loves the puppies',
    },
    bookings: [
      {
        checkIn: new Date('2025-09-15'),
        checkOut: new Date('2025-09-19'),
        status: 'checked_out',
        totalPrice: 120000,
        room: { name: 'Room A1', roomType: { name: 'Standard Double' } },
      },
    ],
    availability: [
      { roomTypeName: 'Standard Double', available: 3, dateRange: '2026-03-15 to 2026-06-13' },
      { roomTypeName: 'Deluxe Suite', available: 1, dateRange: '2026-03-15 to 2026-06-13' },
    ],
    events: [
      {
        title: 'Puppy Yoga on the Rooftop',
        type: 'puppy_yoga',
        date: new Date('2026-03-20'),
        time: '09:00',
        capacity: 8,
        registrationCount: 5,
      },
      {
        title: 'Puppy Beach Walk',
        type: 'beach_walk',
        date: new Date('2026-03-22'),
        time: '16:00',
        capacity: 12,
        registrationCount: 2,
      },
    ],
    faqs: [
      { question: 'What time is check-in?', answer: 'Check-in is from 3:00 PM onwards.' },
      { question: 'Are meals included?', answer: 'Yes, all retreat packages include vegetarian meals.' },
    ],
    ...overrides,
  };
}

// ─── BRAND_VOICE_PREFIX tests ────────────────────────────

describe('BRAND_VOICE_PREFIX', () => {
  it('exceeds 4000 characters for Anthropic prompt caching threshold', () => {
    expect(BRAND_VOICE_PREFIX.length).toBeGreaterThan(4000);
  });

  it('contains key brand elements', () => {
    expect(BRAND_VOICE_PREFIX).toContain('Ines Brendel');
    expect(BRAND_VOICE_PREFIX).toContain('Puppy Yoga Retreat');
    expect(BRAND_VOICE_PREFIX).toContain('Peyia');
    expect(BRAND_VOICE_PREFIX).toContain('Paphos');
    expect(BRAND_VOICE_PREFIX).toContain('Cyprus');
    expect(BRAND_VOICE_PREFIX).toContain('rescue');
    expect(BRAND_VOICE_PREFIX).toContain('4-Day');
    expect(BRAND_VOICE_PREFIX).toContain('7-Day');
    expect(BRAND_VOICE_PREFIX).toContain('vegetarian');
  });

  it('mentions standalone events', () => {
    expect(BRAND_VOICE_PREFIX).toContain('Puppy Yoga Classes');
    expect(BRAND_VOICE_PREFIX).toContain('Beach Walk');
    expect(BRAND_VOICE_PREFIX).toContain('Coffee, Cake & Cuddles');
  });

  it('mentions communication style', () => {
    expect(BRAND_VOICE_PREFIX).toContain('Warm and welcoming');
    expect(BRAND_VOICE_PREFIX).toContain('sign off as Ines');
  });
});

// ─── GUARDRAILS tests ────────────────────────────────────

describe('GUARDRAILS', () => {
  it('includes critical guardrails', () => {
    expect(GUARDRAILS).toContain('No pricing commitments without checking availability');
    expect(GUARDRAILS).toContain('No medical or dietary advice');
    expect(GUARDRAILS).toContain('No promises about specific puppies');
    expect(GUARDRAILS).toContain('Never discuss competitor retreats');
    expect(GUARDRAILS).toContain('Never share personal information about other guests');
    expect(GUARDRAILS).toContain('Never make guarantees about weather');
    expect(GUARDRAILS).toContain('No unauthorized commitments');
    expect(GUARDRAILS).toContain('Plain text only (no Markdown)');
  });
});

// ─── Formatting helpers tests ────────────────────────────

describe('formatGuestProfile', () => {
  it('formats a full guest profile', () => {
    const ctx = makeDraftContext();
    const result = formatGuestProfile(ctx.guest);
    expect(result).toContain('Maria Schmidt');
    expect(result).toContain('maria@example.com');
    expect(result).toContain('+49 170 1234567');
    expect(result).toContain('German');
    expect(result).toContain('Vegan');
    expect(result).toContain('Returning guest');
  });

  it('handles null guest', () => {
    const result = formatGuestProfile(null);
    expect(result).toContain('unknown guest');
  });

  it('handles guest with minimal fields', () => {
    const result = formatGuestProfile({
      id: 'g1',
      name: 'John',
      email: 'john@test.com',
      phone: null,
      language: 'en',
      dietaryNeeds: null,
      notes: null,
    });
    expect(result).toContain('John');
    expect(result).toContain('English');
    expect(result).not.toContain('Phone');
    expect(result).not.toContain('Dietary');
  });
});

describe('formatBookings', () => {
  it('formats bookings with room details', () => {
    const ctx = makeDraftContext();
    const result = formatBookings(ctx.bookings);
    expect(result).toContain('2025-09-15');
    expect(result).toContain('2025-09-19');
    expect(result).toContain('Standard Double');
    expect(result).toContain('Room A1');
    expect(result).toContain('checked_out');
    expect(result).toContain('EUR 1200.00');
  });

  it('returns message for empty bookings', () => {
    const result = formatBookings([]);
    expect(result).toContain('No previous bookings');
  });
});

describe('formatAvailability', () => {
  it('formats availability by room type', () => {
    const ctx = makeDraftContext();
    const result = formatAvailability(ctx.availability);
    expect(result).toContain('Standard Double');
    expect(result).toContain('3 rooms available');
    expect(result).toContain('Deluxe Suite');
    expect(result).toContain('1 rooms available');
  });

  it('returns message for empty availability', () => {
    const result = formatAvailability([]);
    expect(result).toContain('No availability data');
  });
});

describe('formatEvents', () => {
  it('formats events with capacity info', () => {
    const ctx = makeDraftContext();
    const result = formatEvents(ctx.events);
    expect(result).toContain('Puppy Yoga on the Rooftop');
    expect(result).toContain('puppy_yoga');
    expect(result).toContain('3/8 slots remaining');
    expect(result).toContain('Puppy Beach Walk');
    expect(result).toContain('10/12 slots remaining');
  });

  it('returns message for empty events', () => {
    const result = formatEvents([]);
    expect(result).toContain('No upcoming events');
  });
});

describe('formatFaqs', () => {
  it('formats FAQ entries with numbered Q&A pairs', () => {
    const faqs = [
      { question: 'What time is check-in?', answer: 'Check-in is from 3:00 PM onwards.' },
      { question: 'Are meals included?', answer: 'Yes, all retreat packages include vegetarian meals.' },
    ];
    const result = formatFaqs(faqs);
    expect(result).toContain('1. **Q:** What time is check-in?');
    expect(result).toContain('**A:** Check-in is from 3:00 PM onwards.');
    expect(result).toContain('2. **Q:** Are meals included?');
    expect(result).toContain('**A:** Yes, all retreat packages include vegetarian meals.');
  });

  it('returns fallback message for empty array', () => {
    const result = formatFaqs([]);
    expect(result).toContain('No FAQ entries available');
  });
});

describe('formatConversationHistory', () => {
  it('formats message direction, timestamp, and content', () => {
    const result = formatConversationHistory([
      {
        direction: 'in',
        content: 'Hello, I have a question about availability.',
        sentAt: new Date('2026-03-15T10:00:00Z'),
      },
      {
        direction: 'out',
        content: 'Thanks for your message! We have options in April.',
        sentAt: new Date('2026-03-15T10:05:00Z'),
      },
    ]);

    expect(result).toContain('Guest: Hello, I have a question about availability.');
    expect(result).toContain('Ines: Thanks for your message! We have options in April.');
    expect(result).toContain('Europe/Nicosia');
  });

  it('returns fallback for empty history', () => {
    expect(formatConversationHistory([])).toContain('No conversation messages available');
  });
});

// ─── buildSystemPrompt tests ─────────────────────────────

describe('buildSystemPrompt', () => {
  it('includes guest name and email', () => {
    const ctx = makeDraftContext();
    const prompt = buildSystemPrompt(ctx, 'en');
    expect(prompt).toContain('Maria Schmidt');
    expect(prompt).toContain('maria@example.com');
  });

  it('includes booking history formatted', () => {
    const ctx = makeDraftContext();
    const prompt = buildSystemPrompt(ctx, 'en');
    expect(prompt).toContain('2025-09-15');
    expect(prompt).toContain('Standard Double');
  });

  it('includes availability summary', () => {
    const ctx = makeDraftContext();
    const prompt = buildSystemPrompt(ctx, 'en');
    expect(prompt).toContain('Standard Double');
    expect(prompt).toContain('3 rooms available');
  });

  it('includes upcoming events', () => {
    const ctx = makeDraftContext();
    const prompt = buildSystemPrompt(ctx, 'en');
    expect(prompt).toContain('Puppy Yoga on the Rooftop');
    expect(prompt).toContain('Puppy Beach Walk');
  });

  it('includes FAQ section with entries', () => {
    const ctx = makeDraftContext();
    const prompt = buildSystemPrompt(ctx, 'en');
    expect(prompt).toContain('Frequently Asked Questions');
    expect(prompt).toContain('What time is check-in?');
    expect(prompt).toContain('Are meals included?');
  });

  it('includes FAQ fallback when no FAQs exist', () => {
    const ctx = makeDraftContext({ faqs: [] });
    const prompt = buildSystemPrompt(ctx, 'en');
    expect(prompt).toContain('No FAQ entries available');
  });

  it('includes brand voice prefix content', () => {
    const ctx = makeDraftContext();
    const prompt = buildSystemPrompt(ctx, 'en');
    expect(prompt).toContain('Ines Brendel');
    expect(prompt).toContain('Puppy Yoga Retreat');
  });

  it('includes guardrails', () => {
    const ctx = makeDraftContext();
    const prompt = buildSystemPrompt(ctx, 'en');
    expect(prompt).toContain('Communication Guardrails');
    expect(prompt).toContain('No pricing commitments');
  });

  it('includes Cyprus current date and conversation history', () => {
    const ctx = makeDraftContext();
    const prompt = buildSystemPrompt(ctx, 'en');
    expect(prompt).toContain('Today in Cyprus');
    expect(prompt).toContain('Europe/Nicosia');
    expect(prompt).toContain('Conversation History');
    expect(prompt).toContain('Guest: I would like to book a 4-day retreat in April.');
  });

  it('says "Respond in German" when language is de', () => {
    const ctx = makeDraftContext();
    const prompt = buildSystemPrompt(ctx, 'de');
    expect(prompt).toContain('Respond in German');
    expect(prompt).toContain('Sign off as Ines');
  });

  it('says "Respond in English" when language is en', () => {
    const ctx = makeDraftContext();
    const prompt = buildSystemPrompt(ctx, 'en');
    expect(prompt).toContain('Respond in English');
    expect(prompt).toContain('Sign off as Ines');
  });

  it('handles null guest gracefully', () => {
    const ctx = makeDraftContext({ guest: null, bookings: [] });
    const prompt = buildSystemPrompt(ctx, 'en');
    expect(prompt).toContain('unknown guest');
    expect(prompt).toContain('No previous bookings');
  });
});

// ─── Classification prompt tests ─────────────────────────

describe('CLASSIFICATION_PROMPT', () => {
  it('includes all category names', () => {
    expect(CLASSIFICATION_PROMPT).toContain('guest_inquiry');
    expect(CLASSIFICATION_PROMPT).toContain('ota_notification');
    expect(CLASSIFICATION_PROMPT).toContain('spam_newsletter');
    expect(CLASSIFICATION_PROMPT).toContain('admin_system');
  });

  it('includes edge case flag descriptions', () => {
    expect(CLASSIFICATION_PROMPT).toContain('complaint');
    expect(CLASSIFICATION_PROMPT).toContain('medical');
    expect(CLASSIFICATION_PROMPT).toContain('dietary');
    expect(CLASSIFICATION_PROMPT).toContain('cancellation');
    expect(CLASSIFICATION_PROMPT).toContain('adoption');
  });
});

describe('formatClassificationContext', () => {
  it('formats message content', () => {
    const result = formatClassificationContext('Hello, I want to book a retreat');
    expect(result).toContain('Hello, I want to book a retreat');
  });

  it('includes metadata when provided', () => {
    const result = formatClassificationContext('Hello', {
      from: 'maria@example.com',
      subject: 'Retreat inquiry',
      channel: 'email',
    });
    expect(result).toContain('From: maria@example.com');
    expect(result).toContain('Subject: Retreat inquiry');
    expect(result).toContain('Channel: email');
  });

  it('handles missing metadata', () => {
    const result = formatClassificationContext('Hello');
    expect(result).toContain('Message:');
    expect(result).toContain('Hello');
  });
});

// ─── buildDraftContext tests (with mocked Prisma) ────────

describe('buildDraftContext', () => {
  let mockPrisma: Record<string, Record<string, ReturnType<typeof vi.fn>>>;

  beforeEach(() => {
    mockPrisma = {
      conversation: {
        findUnique: vi.fn(),
      },
      booking: {
        findMany: vi.fn(),
      },
      roomType: {
        findMany: vi.fn(),
      },
      event: {
        findMany: vi.fn(),
      },
      eventBooking: {
        groupBy: vi.fn().mockResolvedValue([]),
      },
      faq: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
  });

  it('assembles context from conversation, guest, bookings, rooms, and events', async () => {
    mockPrisma['conversation']!['findUnique']!.mockResolvedValue({
      id: 'conv-1',
      subject: 'Inquiry about retreat',
      guest: {
        id: 'guest-1',
        name: 'Anna Test',
        email: 'anna@test.com',
        phone: null,
        language: 'en',
        dietaryNeeds: null,
        notes: null,
      },
      messages: [
        {
          direction: 'in',
          content: 'Hi, I would like to book',
          sentAt: new Date('2026-03-10T08:00:00Z'),
        },
      ],
    });

    mockPrisma['booking']!['findMany']!.mockResolvedValue([
      {
        checkIn: new Date('2025-06-01'),
        checkOut: new Date('2025-06-05'),
        status: 'checked_out',
        totalPrice: 80000,
        room: { name: 'Room B2', roomType: { name: 'Standard' } },
      },
    ]);

    mockPrisma['roomType']!['findMany']!.mockResolvedValue([
      {
        name: 'Standard',
        rooms: [
          { id: 'r1', bookings: [] },
          { id: 'r2', bookings: [{ id: 'b1' }] },
        ],
      },
    ]);

    mockPrisma['event']!['findMany']!.mockResolvedValue([
      {
        id: 'event-1',
        title: 'Puppy Yoga',
        type: 'puppy_yoga',
        date: new Date('2026-03-20'),
        time: '09:00',
        capacity: 8,
      },
    ]);
    mockPrisma['eventBooking']!['groupBy']!.mockResolvedValue([
      {
        eventId: 'event-1',
        _sum: { attendeeCount: 3 },
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await buildDraftContext(mockPrisma as any, 'conv-1');

    expect(result.conversation.id).toBe('conv-1');
    expect(result.conversation.subject).toBe('Inquiry about retreat');
    expect(result.conversation.messages).toHaveLength(1);
    expect(result.guest?.name).toBe('Anna Test');
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0]!.room?.name).toBe('Room B2');
    expect(result.availability).toHaveLength(1);
    expect(result.availability[0]!.roomTypeName).toBe('Standard');
    expect(result.availability[0]!.available).toBe(1); // 2 total - 1 booked
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.registrationCount).toBe(3);
    expect(result.faqs).toEqual([]);
  });

  it('loads FAQ entries into context', async () => {
    mockPrisma['conversation']!['findUnique']!.mockResolvedValue({
      id: 'conv-3',
      subject: 'FAQ test',
      guest: null,
      messages: [{ direction: 'in', content: 'Question', sentAt: new Date() }],
    });
    mockPrisma['roomType']!['findMany']!.mockResolvedValue([]);
    mockPrisma['event']!['findMany']!.mockResolvedValue([]);
    mockPrisma['faq']!['findMany']!.mockResolvedValue([
      { question: 'What is check-in time?', answer: 'Check-in is at 3 PM.' },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await buildDraftContext(mockPrisma as any, 'conv-3');

    expect(result.faqs).toHaveLength(1);
    expect(result.faqs[0]!.question).toBe('What is check-in time?');
    expect(result.faqs[0]!.answer).toBe('Check-in is at 3 PM.');
  });

  it('handles conversation without guest', async () => {
    mockPrisma['conversation']!['findUnique']!.mockResolvedValue({
      id: 'conv-2',
      subject: 'General inquiry',
      guest: null,
      messages: [
        {
          direction: 'in',
          content: 'What are your prices?',
          sentAt: new Date('2026-03-10T08:00:00Z'),
        },
      ],
    });

    mockPrisma['roomType']!['findMany']!.mockResolvedValue([]);
    mockPrisma['event']!['findMany']!.mockResolvedValue([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await buildDraftContext(mockPrisma as any, 'conv-2');

    expect(result.guest).toBeNull();
    expect(result.bookings).toEqual([]);
    // booking.findMany should NOT be called when guest is null
    expect(mockPrisma['booking']!['findMany']).not.toHaveBeenCalled();
  });

  it('throws 404 when conversation not found', async () => {
    mockPrisma['conversation']!['findUnique']!.mockResolvedValue(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(buildDraftContext(mockPrisma as any, 'nonexistent')).rejects.toThrow(
      'Conversation not found',
    );
  });
});
