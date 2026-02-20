import type { PrismaClient } from '@prisma/client';
import { utcMidnight, nicosiaToday } from '../../lib/date-helpers.js';

// ─── Types ──────────────────────────────────────────────

export interface GuestSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  language: string;
  dietaryNeeds: string | null;
  source: string | null;
  tags: string[];
  notes: string | null;
}

export interface BookingSummary {
  id: string;
  checkIn: string;
  checkOut: string;
  status: string;
  totalPrice: number;
  source: string | null;
  roomName: string;
  roomTypeName: string;
}

export interface MessageSummary {
  id: string;
  direction: string;
  content: string;
  channel: string;
  fromAddress: string | null;
  fromName: string | null;
  sentAt: string;
}

export interface ConversationContext {
  conversation: {
    id: string;
    channel: string;
    subject: string | null;
    status: string;
    classification: string | null;
    messages: MessageSummary[];
  };
  guest: GuestSummary | null;
  bookings: BookingSummary[];
  availability: AvailabilityItem[];
  events: UpcomingEvent[];
}

export interface ConversationSummary {
  id: string;
  channel: string;
  subject: string | null;
  status: string;
  classification: string | null;
  messageCount: number;
  lastMessageAt: string | null;
}

export interface GuestContext {
  guest: GuestSummary;
  bookings: BookingSummary[];
  conversations: ConversationSummary[];
}

export interface AvailabilityItem {
  roomTypeName: string;
  totalRooms: number;
  bookedRooms: number;
  availableRooms: number;
  dateRange: {
    from: string;
    to: string;
  };
}

export interface UpcomingEvent {
  id: string;
  title: string;
  type: string;
  date: string;
  time: string;
  capacity: number;
  registeredCount: number;
  remainingSlots: number;
}

// ─── Helpers ────────────────────────────────────────────

function toGuestSummary(guest: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  language: string;
  dietaryNeeds: string | null;
  source: string | null;
  tags: string[];
  notes: string | null;
}): GuestSummary {
  return {
    id: guest.id,
    name: guest.name,
    email: guest.email,
    phone: guest.phone,
    language: guest.language,
    dietaryNeeds: guest.dietaryNeeds,
    source: guest.source,
    tags: guest.tags,
    notes: guest.notes,
  };
}

function toBookingSummary(booking: {
  id: string;
  checkIn: Date;
  checkOut: Date;
  status: string;
  totalPrice: number;
  source: string | null;
  room: { name: string; roomType: { name: string } };
}): BookingSummary {
  return {
    id: booking.id,
    checkIn: booking.checkIn.toISOString().split('T')[0]!,
    checkOut: booking.checkOut.toISOString().split('T')[0]!,
    status: booking.status,
    totalPrice: booking.totalPrice,
    source: booking.source,
    roomName: booking.room.name,
    roomTypeName: booking.room.roomType.name,
  };
}

// ─── Service functions ──────────────────────────────────

/**
 * Get full conversation context for AI draft generation.
 * Pre-aggregates: conversation + messages, guest profile, booking history,
 * room availability (next 90 days), and upcoming events (next 30 days).
 */
export async function getConversationContext(
  prisma: PrismaClient,
  conversationId: string,
): Promise<ConversationContext> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: {
        orderBy: { sentAt: 'asc' },
        select: {
          id: true,
          direction: true,
          content: true,
          channel: true,
          fromAddress: true,
          fromName: true,
          sentAt: true,
        },
      },
      guest: true,
    },
  });

  if (!conversation) {
    throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });
  }

  const messages: MessageSummary[] = conversation.messages.map((m) => ({
    id: m.id,
    direction: m.direction,
    content: m.content,
    channel: m.channel,
    fromAddress: m.fromAddress,
    fromName: m.fromName,
    sentAt: m.sentAt.toISOString(),
  }));

  let guest: GuestSummary | null = null;
  let bookings: BookingSummary[] = [];

  if (conversation.guest) {
    guest = toGuestSummary(conversation.guest);

    const guestBookings = await prisma.booking.findMany({
      where: { guestId: conversation.guest.id, deletedAt: null },
      orderBy: { checkIn: 'desc' },
      include: { room: { include: { roomType: true } } },
    });

    bookings = guestBookings.map(toBookingSummary);
  }

  const [availability, events] = await Promise.all([
    getAvailabilitySummary(prisma),
    getUpcomingEvents(prisma),
  ]);

  return {
    conversation: {
      id: conversation.id,
      channel: conversation.channel,
      subject: conversation.subject,
      status: conversation.status,
      classification: conversation.classification,
      messages,
    },
    guest,
    bookings,
    availability,
    events,
  };
}

/**
 * Get guest CRM profile with booking and conversation history.
 */
export async function getGuestContext(
  prisma: PrismaClient,
  guestId: string,
): Promise<GuestContext> {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    include: {
      bookings: {
        where: { deletedAt: null },
        orderBy: { checkIn: 'desc' },
        include: { room: { include: { roomType: true } } },
      },
      conversations: {
        orderBy: { lastMessageAt: 'desc' },
        include: {
          _count: { select: { messages: true } },
        },
      },
    },
  });

  if (!guest) {
    throw Object.assign(new Error('Guest not found'), { statusCode: 404 });
  }

  return {
    guest: toGuestSummary(guest),
    bookings: guest.bookings.map(toBookingSummary),
    conversations: guest.conversations.map((c) => ({
      id: c.id,
      channel: c.channel,
      subject: c.subject,
      status: c.status,
      classification: c.classification,
      messageCount: c._count.messages,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    })),
  };
}

/**
 * Get room availability summary for the next 90 days.
 * For each room type: total rooms, booked rooms, and available rooms.
 */
export async function getAvailabilitySummary(
  prisma: PrismaClient,
): Promise<AvailabilityItem[]> {
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
    // Count rooms with at least one overlapping booking
    const bookedRooms = rt.rooms.filter((r) => r.bookings.length > 0).length;

    return {
      roomTypeName: rt.name,
      totalRooms,
      bookedRooms,
      availableRooms: totalRooms - bookedRooms,
      dateRange: {
        from: todayStr,
        to: futureStr,
      },
    };
  });
}

/**
 * Get upcoming events for the next 30 days with registration counts
 * and remaining capacity.
 */
export async function getUpcomingEvents(
  prisma: PrismaClient,
): Promise<UpcomingEvent[]> {
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

  return events.map((e) => {
    const registeredCount = e._count.eventBookings;
    return {
      id: e.id,
      title: e.title,
      type: e.type,
      date: e.date.toISOString().split('T')[0]!,
      time: e.time,
      capacity: e.capacity,
      registeredCount,
      remainingSlots: Math.max(0, e.capacity - registeredCount),
    };
  });
}
