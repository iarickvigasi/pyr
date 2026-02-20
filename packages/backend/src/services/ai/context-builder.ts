/**
 * AI context builder -- aggregates business data for draft generation.
 *
 * Assembles guest CRM data, conversation history, room availability,
 * upcoming events, and booking history into a structured DraftContext
 * that the system prompt template consumes.
 *
 * This function powers both:
 * - Draft generation (via OpenClaw webhook or direct call)
 * - Agent API endpoints (Plan 01's getConversationContext uses the same data)
 */

import type { PrismaClient } from '@prisma/client';
import { utcMidnight, nicosiaToday } from '../../lib/date-helpers.js';

// ─── Types ───────────────────────────────────────────────

export interface DraftContext {
  conversation: {
    id: string;
    subject: string | null;
    messages: Array<{
      direction: string;
      content: string;
      sentAt: Date;
    }>;
  };
  guest: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    language: string | null;
    dietaryNeeds: string | null;
    notes: string | null;
  } | null;
  bookings: Array<{
    checkIn: Date;
    checkOut: Date;
    status: string;
    totalPrice: number;
    room: {
      name: string;
      roomType: { name: string };
    } | null;
  }>;
  availability: Array<{
    roomTypeName: string;
    available: number;
    dateRange: string;
  }>;
  events: Array<{
    title: string;
    type: string;
    date: Date;
    time: string | null;
    capacity: number;
    registrationCount: number;
  }>;
  faqs: Array<{ question: string; answer: string }>;
}

// ─── Public API ──────────────────────────────────────────

/**
 * Build draft context by aggregating business data from Prisma.
 *
 * Loads:
 * 1. Conversation with all messages (ordered by sentAt asc) and guest
 * 2. Guest's booking history (if guest exists, where deletedAt null, ordered checkIn desc)
 * 3. Room availability for next 90 days (per room type)
 * 4. Upcoming events for next 30 days with registration counts
 *
 * @param prisma - Prisma client instance
 * @param conversationId - The conversation to build context for
 * @returns Assembled DraftContext ready for system prompt building
 */
export async function buildDraftContext(
  prisma: PrismaClient,
  conversationId: string,
): Promise<DraftContext> {
  // 1. Load conversation with messages and guest
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: {
        orderBy: { sentAt: 'asc' },
        select: {
          direction: true,
          content: true,
          sentAt: true,
        },
      },
      guest: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          language: true,
          dietaryNeeds: true,
          notes: true,
        },
      },
    },
  });

  if (!conversation) {
    throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });
  }

  // 2. Load guest's booking history
  let bookings: DraftContext['bookings'] = [];
  if (conversation.guest) {
    const guestBookings = await prisma.booking.findMany({
      where: { guestId: conversation.guest.id, deletedAt: null },
      orderBy: { checkIn: 'desc' },
      include: {
        room: {
          include: { roomType: { select: { name: true } } },
        },
      },
    });

    bookings = guestBookings.map((b) => ({
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      status: b.status,
      totalPrice: b.totalPrice,
      room: b.room
        ? { name: b.room.name, roomType: { name: b.room.roomType.name } }
        : null,
    }));
  }

  // 3. Load room availability for next 90 days
  const availability = await getAvailabilitySummary(prisma);

  // 4. Load upcoming events for next 30 days
  const events = await getUpcomingEvents(prisma);

  // 5. Load all FAQ entries (inject all into prompt -- LLM selects relevant ones naturally)
  const faqEntries = await prisma.faq.findMany({
    orderBy: { createdAt: 'asc' },
    select: { question: true, answer: true },
  });

  return {
    conversation: {
      id: conversation.id,
      subject: conversation.subject,
      messages: conversation.messages.map((m) => ({
        direction: m.direction,
        content: m.content,
        sentAt: m.sentAt,
      })),
    },
    guest: conversation.guest,
    bookings,
    availability,
    events,
    faqs: faqEntries,
  };
}

// ─── Helpers ─────────────────────────────────────────────

/**
 * Get room availability summary for the next 90 days.
 * Per room type: count total rooms minus rooms with confirmed/checked-in bookings.
 */
async function getAvailabilitySummary(
  prisma: PrismaClient,
): Promise<DraftContext['availability']> {
  const todayStr = nicosiaToday();
  const today = utcMidnight(todayStr);

  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + 90);
  const futureStr = futureDate.toISOString().split('T')[0]!;

  const roomTypes = await prisma.roomType.findMany({
    include: {
      rooms: {
        select: {
          id: true,
          bookings: {
            where: {
              deletedAt: null,
              status: { in: ['confirmed', 'checked_in'] },
              checkIn: { lt: futureDate },
              checkOut: { gt: today },
            },
            select: { id: true },
          },
        },
      },
    },
  });

  return roomTypes.map((rt) => {
    const totalRooms = rt.rooms.length;
    const bookedRooms = rt.rooms.filter((r) => r.bookings.length > 0).length;

    return {
      roomTypeName: rt.name,
      available: totalRooms - bookedRooms,
      dateRange: `${todayStr} to ${futureStr}`,
    };
  });
}

/**
 * Get upcoming events for the next 30 days with registration counts.
 */
async function getUpcomingEvents(
  prisma: PrismaClient,
): Promise<DraftContext['events']> {
  const today = utcMidnight(nicosiaToday());

  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + 30);

  const events = await prisma.event.findMany({
    where: {
      date: { gte: today, lt: futureDate },
    },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
    include: {
      _count: {
        select: {
          eventBookings: { where: { status: 'confirmed' } },
        },
      },
    },
  });

  return events.map((e) => ({
    title: e.title,
    type: e.type,
    date: e.date,
    time: e.time,
    capacity: e.capacity,
    registrationCount: e._count.eventBookings,
  }));
}
