import type { PrismaClient } from '@prisma/client';
import { getActor, writeAuditLog } from '../../lib/audit.js';
import { BadRequestError, NotFoundError } from '../../lib/errors.js';
import { notDeleted } from '../../lib/prisma-helpers.js';
import {
  createMotopressClientFromEnv,
  MotopressHttpError,
  MotopressValidationError,
  type MotopressEnv,
} from '../../services/motopress/index.js';

type MotopressSyncResult = {
  bookingId: string;
  provider: 'motopress';
  externalBookingId: string;
  syncStatus: 'synced' | 'failed';
  lastSyncedAt: string | null;
  remoteStatus: string;
};

const MOTOPRESS_PROVIDER = 'motopress';

export async function syncBookingToMotopress(
  prisma: PrismaClient,
  bookingId: string,
  config: MotopressEnv,
  actorId?: string,
): Promise<MotopressSyncResult> {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, ...notDeleted },
    include: {
      guest: { select: { id: true, name: true, email: true, phone: true } },
      room: {
        select: {
          id: true,
          name: true,
          externalMappings: {
            where: { provider: MOTOPRESS_PROVIDER },
            take: 1,
          },
        },
      },
    },
  });

  if (!booking) {
    throw new NotFoundError('Booking', bookingId);
  }

  const mapping = booking.room.externalMappings[0];
  if (!mapping) {
    throw new BadRequestError(
      `Room '${booking.room.name}' is not mapped to MotoPress. Configure it in Settings -> Rooms.`,
    );
  }

  const accommodationId = Number.parseInt(mapping.externalAccommodationId, 10);
  if (!Number.isInteger(accommodationId) || accommodationId <= 0) {
    throw new BadRequestError('Mapped external accommodation id must be a positive integer.');
  }

  const existingExternalId = booking.externalProvider?.toLowerCase() === MOTOPRESS_PROVIDER
    ? booking.externalBookingId
    : null;
  const parsedExternalId = existingExternalId ? Number.parseInt(existingExternalId, 10) : null;
  if (existingExternalId && (!parsedExternalId || !Number.isInteger(parsedExternalId) || parsedExternalId <= 0)) {
    throw new BadRequestError('Existing external booking id is invalid. Please clear and re-sync.');
  }

  if (booking.status === 'cancelled' && !parsedExternalId) {
    throw new BadRequestError('Cancelled bookings can only be synced after an initial successful sync.');
  }

  const client = createMotopressClientFromEnv(config);
  const { firstName, lastName } = splitFullName(booking.guest.name);

  const payload = {
    status: mapBookingStatusToMotopress(booking.status),
    check_in_date: formatDateYmd(booking.checkIn),
    check_out_date: formatDateYmd(booking.checkOut),
    customer: {
      first_name: firstName,
      last_name: lastName,
      email: booking.guest.email ?? undefined,
      phone: booking.guest.phone ?? undefined,
    },
    reserved_accommodations: [
      {
        accommodation: accommodationId,
        adults: mapping.defaultAdults ?? 1,
        children: mapping.defaultChildren ?? 0,
        guest_name: booking.guest.name,
      },
    ],
    note: buildSyncNote(booking.id, booking.notes),
  };

  try {
    const remoteBooking = parsedExternalId
      ? await client.updateBooking(parsedExternalId, payload)
      : await client.createBooking(payload);

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          externalProvider: MOTOPRESS_PROVIDER,
          externalBookingId: String(remoteBooking.id),
          syncStatus: 'synced',
          syncError: null,
          lastSyncedAt: now,
          syncVersion: { increment: 1 },
        },
      });

      await writeAuditLog(tx, {
        entityType: 'booking',
        entityId: booking.id,
        action: 'update',
        changes: {
          motopressSync: {
            result: 'synced',
            externalBookingId: String(remoteBooking.id),
            externalStatus: remoteBooking.status,
          },
        },
        actor: getActor(actorId),
      });
    });

    return {
      bookingId: booking.id,
      provider: MOTOPRESS_PROVIDER,
      externalBookingId: String(remoteBooking.id),
      syncStatus: 'synced',
      lastSyncedAt: now.toISOString(),
      remoteStatus: remoteBooking.status,
    };
  } catch (error) {
    const errorMessage = formatSyncErrorMessage(error);

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          syncStatus: 'failed',
          syncError: errorMessage,
          syncVersion: { increment: 1 },
        },
      });

      await writeAuditLog(tx, {
        entityType: 'booking',
        entityId: booking.id,
        action: 'update',
        changes: {
          motopressSync: {
            result: 'failed',
            error: errorMessage,
          },
        },
        actor: getActor(actorId),
      });
    });

    if (error instanceof MotopressHttpError && error.status >= 400 && error.status < 500) {
      throw new BadRequestError(`MotoPress rejected booking payload: ${errorMessage}`);
    }
    if (error instanceof MotopressValidationError) {
      throw new BadRequestError(`MotoPress response validation failed: ${errorMessage}`);
    }
    throw error;
  }
}

function mapBookingStatusToMotopress(status: string): 'pending' | 'confirmed' | 'cancelled' {
  switch (status) {
    case 'inquiry':
      return 'pending';
    case 'confirmed':
    case 'checked_in':
    case 'checked_out':
      return 'confirmed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'pending';
  }
}

function splitFullName(name: string): { firstName: string; lastName: string } {
  const normalized = name.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return { firstName: 'Guest', lastName: '' };
  }
  const [firstName, ...rest] = normalized.split(' ');
  return { firstName: firstName || 'Guest', lastName: rest.join(' ') };
}

function formatDateYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildSyncNote(bookingId: string, notes: string | null): string {
  const base = `Synced from PYR booking ${bookingId}.`;
  if (!notes?.trim()) return base;
  return `${base}\n\n${notes.trim()}`;
}

function formatSyncErrorMessage(error: unknown): string {
  if (error instanceof MotopressHttpError) {
    const detail = typeof error.body === 'string'
      ? error.body
      : safeJson(error.body);
    return `HTTP ${error.status}${detail ? `: ${detail}` : ''}`;
  }
  if (error instanceof MotopressValidationError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown sync error';
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
