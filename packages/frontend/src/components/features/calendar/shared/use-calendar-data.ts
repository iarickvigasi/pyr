import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';
import type { CalendarBookingItem, CalendarEventItem, ViewMode } from './calendar-types';
import { getVisibleRange, format } from './calendar-utils';

export function useCalendarData(currentDate: Date, viewMode: ViewMode) {
  const { start, end } = useMemo(
    () => getVisibleRange(currentDate, viewMode),
    [currentDate, viewMode],
  );

  const from = format(start, 'yyyy-MM-dd');
  const to = format(end, 'yyyy-MM-dd');

  const bookingsQuery = useQuery({
    queryKey: queryKeys.bookings.calendar(from, to),
    queryFn: () =>
      api.get<{
        data: Array<{
          id: string;
          checkIn: string;
          checkOut: string;
          status: string;
          guest: { name: string };
          room: { name: string; roomType: { name: string } };
        }>;
      }>('/api/v1/bookings', { params: { from, to, limit: 100 } }),
  });

  const eventsQuery = useQuery({
    queryKey: queryKeys.events.list({ from, to, limit: 100 }),
    queryFn: () =>
      api.get<{
        data: Array<{
          id: string;
          type: string;
          title: string;
          date: string;
          time: string;
          capacity: number;
          _count: { eventBookings: number };
        }>;
      }>('/api/v1/events', { params: { from, to, limit: 100 } }),
  });

  const bookings: CalendarBookingItem[] = useMemo(
    () =>
      (bookingsQuery.data?.data ?? []).map((b) => ({
        id: b.id,
        guestName: b.guest.name,
        roomName: b.room.name,
        roomTypeName: b.room.roomType.name,
        checkIn: new Date(b.checkIn),
        checkOut: new Date(b.checkOut),
        status: b.status,
      })),
    [bookingsQuery.data],
  );

  const events: CalendarEventItem[] = useMemo(
    () =>
      (eventsQuery.data?.data ?? []).map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        date: new Date(e.date),
        time: e.time,
        capacity: e.capacity,
        registeredCount: e._count.eventBookings,
      })),
    [eventsQuery.data],
  );

  return {
    bookings,
    events,
    isLoading: bookingsQuery.isLoading || eventsQuery.isLoading,
    visibleRange: { start, end },
  };
}
