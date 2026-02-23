import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';
import { formatDate, formatEurCents, formatEventType, dashboardUrl } from '../lib/formatters.js';

interface DashboardStats {
  pendingInquiries: number;
  confirmedBookings: number;
  checkedInGuests: number;
  revenueThisMonth: number;
  totalGuests: number;
  upcomingEvents: number;
}

interface TodaySchedule {
  checkIns: Array<{
    id: string;
    guest: { id: string; name: string };
    room: { name: string };
    checkIn: string;
    checkOut: string;
  }>;
  checkOuts: Array<{
    id: string;
    guest: { id: string; name: string };
    room: { name: string };
    checkIn: string;
    checkOut: string;
  }>;
  events: Array<{
    id: string;
    type: string;
    title: string;
    time: string | null;
    capacity: number;
    _count?: { eventBookings: number };
  }>;
}

export function registerDashboardTools(api: OpenClawPluginApi, client: ApiClient): void {
  api.registerTool({
    name: 'get_dashboard_stats',
    label: 'Business Dashboard Stats',
    description:
      'Get current business KPIs: pending inquiries, confirmed bookings, checked-in guests, revenue this month, total guests, and upcoming events. Great for "how\'s business?" or "revenue this month?".',
    parameters: { type: 'object' as const, properties: {}, required: [] },
    async execute() {
      const data = await client.get<DashboardStats>('/api/v1/dashboard/stats');
      const stats = data as unknown as DashboardStats;
      const result = {
        pendingInquiries: stats.pendingInquiries,
        confirmedBookings: stats.confirmedBookings,
        checkedInGuests: stats.checkedInGuests,
        revenueThisMonth: formatEurCents(stats.revenueThisMonth),
        totalGuests: stats.totalGuests,
        upcomingEvents: stats.upcomingEvents,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  });

  api.registerTool({
    name: 'get_today_schedule',
    label: "Today's Schedule",
    description:
      'Get today\'s schedule: who\'s checking in, who\'s checking out, and what events are happening today. Perfect for morning overview or "what\'s happening today?".',
    parameters: { type: 'object' as const, properties: {}, required: [] },
    async execute() {
      const data = await client.get<TodaySchedule>('/api/v1/dashboard/today');
      const schedule = data as unknown as TodaySchedule;
      const result = {
        checkIns: schedule.checkIns.map(b => ({
          guestName: b.guest.name,
          room: b.room.name,
          checkIn: formatDate(b.checkIn),
          checkOut: formatDate(b.checkOut),
          dashboardUrl: dashboardUrl(`/bookings/${b.id}`),
          guestDashboardUrl: dashboardUrl(`/guests/${b.guest.id}`),
        })),
        checkOuts: schedule.checkOuts.map(b => ({
          guestName: b.guest.name,
          room: b.room.name,
          checkIn: formatDate(b.checkIn),
          checkOut: formatDate(b.checkOut),
          dashboardUrl: dashboardUrl(`/bookings/${b.id}`),
          guestDashboardUrl: dashboardUrl(`/guests/${b.guest.id}`),
        })),
        events: schedule.events.map(e => ({
          type: formatEventType(e.type),
          title: e.title,
          time: e.time,
          capacity: e.capacity,
          registered: e._count?.eventBookings ?? 0,
          dashboardUrl: dashboardUrl(`/events/${e.id}`),
        })),
        summary: {
          totalCheckIns: schedule.checkIns.length,
          totalCheckOuts: schedule.checkOuts.length,
          totalEvents: schedule.events.length,
        },
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  });
}
