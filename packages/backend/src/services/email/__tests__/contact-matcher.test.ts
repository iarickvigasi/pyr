import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  matchGuestByEmail,
  matchGuestByEmailOrName,
  matchOrCreateGuest,
} from '../contact-matcher.js';

function createMockPrisma() {
  const mockFindFirst = vi.fn();
  const mockCreate = vi.fn();

  return {
    guest: {
      findFirst: mockFindFirst,
      create: mockCreate,
    },
    $transaction: vi.fn(),
    _mockFindFirst: mockFindFirst,
    _mockCreate: mockCreate,
  };
}

describe('contact matcher', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = createMockPrisma();
  });

  it('matches existing guest by email (case-insensitive)', async () => {
    prisma._mockFindFirst.mockResolvedValue({ id: 'guest-123' });

    const result = await matchGuestByEmail(prisma as never, 'Anna@Example.com');

    expect(result).toBe('guest-123');
    expect(prisma._mockFindFirst).toHaveBeenCalledWith({
      where: {
        email: { equals: 'anna@example.com', mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true },
    });
  });

  it('returns null when no guest email match exists', async () => {
    prisma._mockFindFirst.mockResolvedValue(null);

    const result = await matchGuestByEmail(prisma as never, 'unknown@example.com');

    expect(result).toBeNull();
  });

  it('matches by email first, then by name', async () => {
    prisma._mockFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'guest-name-match' });

    const result = await matchGuestByEmailOrName(prisma as never, {
      email: 'unknown@example.com',
      name: 'Anna Schmidt',
    });

    expect(result).toBe('guest-name-match');
    expect(prisma._mockFindFirst).toHaveBeenNthCalledWith(1, {
      where: {
        email: { equals: 'unknown@example.com', mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(prisma._mockFindFirst).toHaveBeenNthCalledWith(2, {
      where: {
        name: { equals: 'Anna Schmidt', mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true },
    });
  });

  it('legacy wrapper does not auto-create guests', async () => {
    prisma._mockFindFirst.mockResolvedValue(null);

    const result = await matchOrCreateGuest(
      prisma as never,
      { name: 'New Guest', address: 'new@example.com' },
      'Hello',
      'guest_inquiry',
    );

    expect(result).toBeNull();
    expect(prisma._mockCreate).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
