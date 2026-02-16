"use client";

import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarToolbar } from './calendar-toolbar';
import { MonthView } from './month-view/month-view';
import { WeekView } from './week-view/week-view';
import { useCalendarNavigation } from './shared/use-calendar-navigation';
import { useCalendarData } from './shared/use-calendar-data';
import { format } from './shared/calendar-utils';

export function CalendarPage() {
  const { currentDate, viewMode, setViewMode, goNext, goPrev, goToday } =
    useCalendarNavigation();
  const { bookings, events, isLoading } = useCalendarData(
    currentDate,
    viewMode,
  );
  const router = useRouter();

  const handleDateClick = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    router.push(`/bookings?new=1&date=${dateStr}`);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Calendar</h1>

      <CalendarToolbar
        currentDate={currentDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
      />

      {isLoading ? (
        <Skeleton className="h-[600px] w-full" />
      ) : viewMode === 'month' ? (
        <MonthView
          currentDate={currentDate}
          bookings={bookings}
          events={events}
          onDateClick={handleDateClick}
        />
      ) : (
        <WeekView
          currentDate={currentDate}
          bookings={bookings}
          events={events}
          onDateClick={handleDateClick}
        />
      )}
    </div>
  );
}
