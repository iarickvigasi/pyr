import type { PrismaClient } from '@prisma/client';

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
  guestName: string;
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
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

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
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [checkInBookings, checkOutBookings, todayEvents] = await Promise.all([
    prisma.booking.findMany({
      where: { checkIn: today, deletedAt: null },
      include: {
        guest: { select: { name: true } },
        room: { select: { name: true } },
      },
    }),
    prisma.booking.findMany({
      where: { checkOut: today, deletedAt: null },
      include: {
        guest: { select: { name: true } },
        room: { select: { name: true } },
      },
    }),
    prisma.event.findMany({
      where: { date: today },
      include: {
        _count: {
          select: {
            eventBookings: { where: { status: 'confirmed' } },
          },
        },
      },
      orderBy: { time: 'asc' },
    }),
  ]);

  const checkIns: TodayBooking[] = checkInBookings.map((b) => ({
    id: b.id,
    guestName: b.guest.name,
    roomName: b.room.name,
    checkIn: b.checkIn.toISOString().split('T')[0]!,
    checkOut: b.checkOut.toISOString().split('T')[0]!,
  }));

  const checkOuts: TodayBooking[] = checkOutBookings.map((b) => ({
    id: b.id,
    guestName: b.guest.name,
    roomName: b.room.name,
    checkIn: b.checkIn.toISOString().split('T')[0]!,
    checkOut: b.checkOut.toISOString().split('T')[0]!,
  }));

  const events: TodayEvent[] = todayEvents.map((e) => ({
    id: e.id,
    type: e.type,
    title: e.title,
    time: e.time,
    capacity: e.capacity,
    registeredCount: e._count.eventBookings,
  }));

  return { checkIns, checkOuts, events };
}
