import type { PrismaClient } from '@prisma/client';
import type { EmailCategory } from './email-classifier.js';
import { detectLanguage } from './language-detector.js';
import { writeAuditLog } from '../../lib/audit.js';

/**
 * Match an incoming email sender to an existing CRM guest, or auto-create
 * a new guest record if the sender is unknown and the email is classified
 * as a guest inquiry.
 *
 * Non-guest emails (OTA notifications, spam/newsletters, system messages)
 * return null — no guest record is created for these.
 *
 * @param prisma - PrismaClient instance
 * @param from - Sender info from parsed email (name + address)
 * @param emailText - Plain text content for language detection
 * @param classification - Email category from classifier
 * @returns Guest ID if matched or created, null if non-guest email
 */
export async function matchOrCreateGuest(
  prisma: PrismaClient,
  from: { name: string; address: string },
  emailText: string,
  classification: EmailCategory,
): Promise<string | null> {
  // Only create/match guests for guest inquiries
  if (classification !== 'guest_inquiry') {
    return null;
  }

  // Look up existing guest by exact email, excluding soft-deleted
  const existing = await prisma.guest.findFirst({
    where: {
      email: from.address,
      deletedAt: null,
    },
  });

  if (existing) {
    return existing.id;
  }

  // Detect language from email body
  const detectedLanguage = detectLanguage(emailText);

  // Determine display name: use from.name or fall back to email prefix
  const displayName = from.name || from.address.split('@')[0] || from.address;

  // Create new guest in a transaction with audit log
  const guest = await prisma.$transaction(async (tx) => {
    const newGuest = await tx.guest.create({
      data: {
        name: displayName,
        email: from.address,
        language: detectedLanguage,
        source: 'email',
      },
    });

    await writeAuditLog(tx, {
      entityType: 'guest',
      entityId: newGuest.id,
      action: 'create',
      changes: {
        name: displayName,
        email: from.address,
        language: detectedLanguage,
        source: 'email',
        trigger: 'email-auto-create',
      },
      actor: 'system',
    });

    return newGuest;
  });

  return guest.id;
}
