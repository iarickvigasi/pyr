import { z } from 'zod';

export const dashboardStatsResponseSchema = z.object({
  data: z.object({
    pendingInquiries: z.number(),
    confirmedBookings: z.number(),
    checkedInGuests: z.number(),
    revenueThisMonth: z.number(),
    totalGuests: z.number(),
    upcomingEvents: z.number(),
  }),
});

export const dashboardTodayResponseSchema = z.object({
  data: z.object({
    checkIns: z.array(
      z.object({
        id: z.string(),
        guestName: z.string(),
        roomName: z.string(),
        checkIn: z.string(),
        checkOut: z.string(),
      }),
    ),
    checkOuts: z.array(
      z.object({
        id: z.string(),
        guestName: z.string(),
        roomName: z.string(),
        checkIn: z.string(),
        checkOut: z.string(),
      }),
    ),
    events: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        title: z.string(),
        time: z.string(),
        capacity: z.number(),
        registeredCount: z.number(),
      }),
    ),
  }),
});
