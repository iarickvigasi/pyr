import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchOrCreateGuest } from '../contact-matcher.js';
import type { EmailCategory } from '../email-classifier.js';

// ─── Mocks ──────────────────────────────────────────────────

vi.mock('../../lib/audit.js', () => ({
  writeAuditLog: vi.fn(),
}));

// Import the mocked writeAuditLog for assertions
const { writeAuditLog } = await import('../../lib/audit.js');

function createMockPrisma() {
  const mockCreate = vi.fn();
  const mockFindFirst = vi.fn();
  const txProxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'guest') {
          return { create: mockCreate, findFirst: mockFindFirst };
        }
        if (prop === 'auditLog') {
          return { create: vi.fn() };
        }
        return undefined;
      },
    },
  );

  return {
    guest: {
      findFirst: mockFindFirst,
      create: mockCreate,
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(txProxy);
    }),
    _mockCreate: mockCreate,
    _mockFindFirst: mockFindFirst,
  };
}

// ─── matchOrCreateGuest ─────────────────────────────────────

describe('matchOrCreateGuest', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = createMockPrisma();
  });

  it('returns existing guest ID when email matches', async () => {
    prisma._mockFindFirst.mockResolvedValue({ id: 'guest-123' });

    const result = await matchOrCreateGuest(
      prisma as never,
      { name: 'Anna Schmidt', address: 'anna@gmail.com' },
      'Hello, I want to book.',
      'guest_inquiry',
    );

    expect(result).toBe('guest-123');
    expect(prisma._mockFindFirst).toHaveBeenCalledWith({
      where: { email: 'anna@gmail.com', deletedAt: null },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates new guest for unknown email with guest_inquiry classification', async () => {
    prisma._mockFindFirst.mockResolvedValue(null);
    prisma._mockCreate.mockResolvedValue({ id: 'new-guest-456' });

    const result = await matchOrCreateGuest(
      prisma as never,
      { name: 'John Doe', address: 'john@example.com' },
      'Hello, I would like to book a retreat. Can you please send me more information?',
      'guest_inquiry',
    );

    expect(result).toBe('new-guest-456');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('auto-created guest has language "de" for German email text', async () => {
    prisma._mockFindFirst.mockResolvedValue(null);
    prisma._mockCreate.mockResolvedValue({ id: 'de-guest' });

    await matchOrCreateGuest(
      prisma as never,
      { name: 'Hans Müller', address: 'hans@web.de' },
      'Hallo, ich möchte gerne einen Retreat buchen. Können Sie mir bitte mehr Informationen schicken?',
      'guest_inquiry',
    );

    expect(prisma._mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ language: 'de' }),
      }),
    );
  });

  it('auto-created guest has language "en" for English email text', async () => {
    prisma._mockFindFirst.mockResolvedValue(null);
    prisma._mockCreate.mockResolvedValue({ id: 'en-guest' });

    await matchOrCreateGuest(
      prisma as never,
      { name: 'Jane Smith', address: 'jane@gmail.com' },
      'Hello, I would like to book a retreat. Can you please send me more information?',
      'guest_inquiry',
    );

    expect(prisma._mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ language: 'en' }),
      }),
    );
  });

  it('auto-created guest has source set to "email"', async () => {
    prisma._mockFindFirst.mockResolvedValue(null);
    prisma._mockCreate.mockResolvedValue({ id: 'src-guest' });

    await matchOrCreateGuest(
      prisma as never,
      { name: 'Test User', address: 'test@example.com' },
      'Hello, I would like to book a retreat. Can you please send me more information?',
      'guest_inquiry',
    );

    expect(prisma._mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: 'email' }),
      }),
    );
  });

  it('returns null for ota_notification classification (no guest created)', async () => {
    const result = await matchOrCreateGuest(
      prisma as never,
      { name: 'Tripaneer', address: 'booking@tripaneer.com' },
      'New booking notification',
      'ota_notification',
    );

    expect(result).toBeNull();
    expect(prisma._mockFindFirst).not.toHaveBeenCalled();
    expect(prisma._mockCreate).not.toHaveBeenCalled();
  });

  it('returns null for spam_newsletter classification (no guest created)', async () => {
    const result = await matchOrCreateGuest(
      prisma as never,
      { name: 'Newsletter', address: 'noreply@news.com' },
      'Weekly digest content',
      'spam_newsletter',
    );

    expect(result).toBeNull();
    expect(prisma._mockFindFirst).not.toHaveBeenCalled();
  });

  it('returns null for admin_system classification (no guest created)', async () => {
    const result = await matchOrCreateGuest(
      prisma as never,
      { name: 'Postmaster', address: 'postmaster@mail.com' },
      'Delivery failure',
      'admin_system',
    );

    expect(result).toBeNull();
    expect(prisma._mockFindFirst).not.toHaveBeenCalled();
  });

  it('uses email address as name fallback when from.name is empty', async () => {
    prisma._mockFindFirst.mockResolvedValue(null);
    prisma._mockCreate.mockResolvedValue({ id: 'noname-guest' });

    await matchOrCreateGuest(
      prisma as never,
      { name: '', address: 'mystery@example.com' },
      'Hello, I would like to book a retreat. Can you please send me more information?',
      'guest_inquiry',
    );

    expect(prisma._mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'mystery' }),
      }),
    );
  });

  it('writes audit log entry for auto-created guest', async () => {
    prisma._mockFindFirst.mockResolvedValue(null);
    prisma._mockCreate.mockResolvedValue({ id: 'audit-guest' });

    await matchOrCreateGuest(
      prisma as never,
      { name: 'Audited User', address: 'audit@example.com' },
      'Hello, I would like to book a retreat. Can you please send me more information?',
      'guest_inquiry',
    );

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(), // transaction client
      expect.objectContaining({
        entityType: 'guest',
        entityId: 'audit-guest',
        action: 'create',
        actor: 'system',
        changes: expect.objectContaining({
          email: 'audit@example.com',
          trigger: 'email-auto-create',
        }),
      }),
    );
  });

  it('existing guest lookup excludes soft-deleted guests (deletedAt is null)', async () => {
    prisma._mockFindFirst.mockResolvedValue({ id: 'active-guest' });

    await matchOrCreateGuest(
      prisma as never,
      { name: 'Active', address: 'active@example.com' },
      'Hello',
      'guest_inquiry',
    );

    expect(prisma._mockFindFirst).toHaveBeenCalledWith({
      where: {
        email: 'active@example.com',
        deletedAt: null,
      },
    });
  });
});
