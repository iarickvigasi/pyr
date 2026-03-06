import type { PrismaClient } from '@prisma/client';
import { utcMidnight, nicosiaToday } from '../../lib/date-helpers.js';
import { loadConfirmedAttendeeCountMap } from '../../lib/event-attendee-counts.js';

export interface DashboardStats {
  pendingInquiries: number;
  confirmedBookings: number;
  checkedInGuests: number;
  revenueThisMonth: number;
  totalGuests: number;
  upcomingEvents: number;
}

export interface TodayBooking {
  id: string;
  guestNames: string[]; // Phase 15: frontend update needed
  roomName: string;
  checkIn: string;
  checkOut: string;
}

export interface TodayEvent {
  id: string;
  type: string;
  title: string;
  time: string;
  capacity: number;
  registeredCount: number;
}

export interface DashboardToday {
  checkIns: TodayBooking[];
  checkOuts: TodayBooking[];
  events: TodayEvent[];
}

export async function getStats(prisma: PrismaClient): Promise<DashboardStats> {
  // Use Cyprus timezone for all date boundaries to avoid UTC/local time skew
  const todayStr = nicosiaToday(); // 'YYYY-MM-DD'
  const [y, m] = todayStr.split('-').map(Number) as [number, number, number];
  const monthStart = utcMidnight(`${y}-${String(m).padStart(2, '0')}-01`);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const monthEnd = utcMidnight(`${nextMonth}-01`);
  const today = utcMidnight(todayStr);

  const [
    pendingInquiries,
    confirmedBookings,
    checkedInGuests,
    revenueResult,
    totalGuests,
    upcomingEvents,
  ] = await Promise.all([
    prisma.booking.count({
      where: { status: 'inquiry', deletedAt: null },
    }),
    prisma.booking.count({
      where: { status: 'confirmed', deletedAt: null },
    }),
    prisma.booking.count({
      where: { status: 'checked_in', deletedAt: null },
    }),
    prisma.booking.aggregate({
      _sum: { totalPrice: true },
      where: {
        checkIn: { gte: monthStart, lt: monthEnd },
        status: { in: ['confirmed', 'checked_in', 'checked_out'] },
        deletedAt: null,
      },
    }),
    prisma.guest.count({
      where: { deletedAt: null },
    }),
    prisma.event.count({
      where: { date: { gte: today } },
    }),
  ]);

  return {
    pendingInquiries,
    confirmedBookings,
    checkedInGuests,
    revenueThisMonth: revenueResult._sum.totalPrice ?? 0,
    totalGuests,
    upcomingEvents,
  };
}

export async function getToday(prisma: PrismaClient): Promise<DashboardToday> {
  const today = utcMidnight(nicosiaToday());

  const [checkInBookings, checkOutBookings, todayEvents] = await Promise.all([
    prisma.booking.findMany({
      where: { checkIn: today, deletedAt: null },
      include: {
        guest: { select: { name: true } },
        bookingGuests: { include: { guest: { select: { name: true } } } },
        room: { select: { name: true } },
      },
    }),
    prisma.booking.findMany({
      where: { checkOut: today, deletedAt: null },
      include: {
        guest: { select: { name: true } },
        bookingGuests: { include: { guest: { select: { name: true } } } },
        room: { select: { name: true } },
      },
    }),
    prisma.event.findMany({
      where: { date: today },
      orderBy: { time: 'asc' },
    }),
  ]);

  const checkIns: TodayBooking[] = checkInBookings.map((b) => ({
    id: b.id,
    guestNames: b.bookingGuests.length > 0
      ? b.bookingGuests.map((bg) => bg.guest.name)
      : [b.guest.name],
    roomName: b.room.name,
    checkIn: b.checkIn.toISOString().split('T')[0]!,
    checkOut: b.checkOut.toISOString().split('T')[0]!,
  }));

  const checkOuts: TodayBooking[] = checkOutBookings.map((b) => ({
    id: b.id,
    guestNames: b.bookingGuests.length > 0
      ? b.bookingGuests.map((bg) => bg.guest.name)
      : [b.guest.name],
    roomName: b.room.name,
    checkIn: b.checkIn.toISOString().split('T')[0]!,
    checkOut: b.checkOut.toISOString().split('T')[0]!,
  }));

  const attendeeCountByEventId = await loadConfirmedAttendeeCountMap(
    prisma,
    todayEvents.map((event) => event.id),
  );

  const events: TodayEvent[] = todayEvents.map((e) => ({
    id: e.id,
    type: e.type,
    title: e.title,
    time: e.time,
    capacity: e.capacity,
    registeredCount: attendeeCountByEventId.get(e.id) ?? 0,
  }));

  return { checkIns, checkOuts, events };
}
