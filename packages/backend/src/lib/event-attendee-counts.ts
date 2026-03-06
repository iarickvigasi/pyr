import type { PrismaClient } from '@prisma/client';

/**
 * Sum confirmed attendee volume per event.
 * A single registration can represent multiple attendees, so row counts are
 * not enough once OTA/inbox flows set attendeeCount > 1.
 */
export async function loadConfirmedAttendeeCountMap(
  prisma: PrismaClient,
  eventIds: string[],
): Promise<Map<string, number>> {
  if (eventIds.length === 0) {
    return new Map();
  }

  const attendeeSums = await prisma.eventBooking.groupBy({
    by: ['eventId'],
    where: {
      eventId: { in: eventIds },
      status: 'confirmed',
    },
    _sum: { attendeeCount: true },
  });

  return new Map(
    attendeeSums.map((row) => [row.eventId, row._sum.attendeeCount ?? 0]),
  );
}
