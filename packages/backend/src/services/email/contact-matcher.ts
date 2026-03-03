import type { PrismaClient } from '@prisma/client';
import type { EmailCategory } from './email-classifier.js';

function normalizeEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
}

function normalizeName(name: string | null | undefined): string | null {
  const value = name?.trim();
  return value ? value : null;
}

/**
 * Match an existing guest by exact email (case-insensitive).
 * Never creates new guests; caller decides whether to offer manual creation.
 */
export async function matchGuestByEmail(
  prisma: PrismaClient,
  email: string | null | undefined,
): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const guest = await prisma.guest.findFirst({
    where: {
      email: { equals: normalized, mode: 'insensitive' },
      deletedAt: null,
    },
    select: { id: true },
  });

  return guest?.id ?? null;
}

/**
 * Match an existing guest by email first, then by name.
 * Name matching is a fallback and intentionally conservative.
 */
export async function matchGuestByEmailOrName(
  prisma: PrismaClient,
  candidate: { email?: string | null; name?: string | null },
): Promise<string | null> {
  const byEmail = await matchGuestByEmail(prisma, candidate.email);
  if (byEmail) return byEmail;

  const normalizedName = normalizeName(candidate.name);
  if (!normalizedName) return null;

  const guest = await prisma.guest.findFirst({
    where: {
      name: { equals: normalizedName, mode: 'insensitive' },
      deletedAt: null,
    },
    select: { id: true },
  });

  return guest?.id ?? null;
}

/**
 * Backward-compatible wrapper kept for old call sites/tests.
 * New behavior intentionally does NOT auto-create guests from inbound emails.
 */
export async function matchOrCreateGuest(
  prisma: PrismaClient,
  from: { name: string; address: string },
  _emailText: string,
  classification: EmailCategory,
): Promise<string | null> {
  if (classification !== 'conversation' && classification !== 'guest_inquiry') {
    return null;
  }
  return matchGuestByEmail(prisma, from.address);
}
