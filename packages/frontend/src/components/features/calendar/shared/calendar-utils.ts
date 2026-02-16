import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  addDays,
  addMonths,
  addWeeks,
  subMonths,
  subWeeks,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  differenceInDays,
  format,
} from 'date-fns';
import type { CalendarBookingItem, BookingBarSegment, ViewMode } from './calendar-types';

export function getVisibleRange(
  date: Date,
  mode: ViewMode,
): { start: Date; end: Date } {
  if (mode === 'week') {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = endOfWeek(date, { weekStartsOn: 1 });
    return { start, end };
  }
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const start = startOfWeek(monthStart, { weekStartsOn: 1 });
  const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
  return { start, end };
}

export function getWeeksInRange(start: Date, end: Date): Date[][] {
  const weeks: Date[][] = [];
  let current = start;
  while (current <= end) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(addDays(current, i));
    }
    weeks.push(week);
    current = addDays(current, 7);
  }
  return weeks;
}

export function splitBookingIntoWeekSegments(
  booking: CalendarBookingItem,
  weekStart: Date,
  weekEnd: Date,
): { startCol: number; endCol: number } | null {
  const bookingStart = startOfDay(booking.checkIn);
  const bookingEnd = startOfDay(booking.checkOut);

  if (bookingEnd <= weekStart || bookingStart > weekEnd) return null;

  const effectiveStart = bookingStart < weekStart ? weekStart : bookingStart;
  const effectiveEnd = bookingEnd > addDays(weekEnd, 1)
    ? addDays(weekEnd, 1)
    : bookingEnd;

  const startCol = differenceInDays(effectiveStart, weekStart);
  const endCol = differenceInDays(effectiveEnd, weekStart);

  if (startCol >= endCol) return null;

  return { startCol, endCol };
}

export function assignSlotIndexes(
  segments: Array<{ booking: CalendarBookingItem; startCol: number; endCol: number }>,
): BookingBarSegment[] {
  const sorted = [...segments].sort((a, b) => a.startCol - b.startCol || a.endCol - b.endCol);
  const result: BookingBarSegment[] = [];
  const slotEnds: number[] = [];

  for (const seg of sorted) {
    let slotIndex = slotEnds.findIndex((end) => end <= seg.startCol);
    if (slotIndex === -1) {
      slotIndex = slotEnds.length;
      slotEnds.push(0);
    }
    slotEnds[slotIndex] = seg.endCol;
    result.push({ ...seg, slotIndex });
  }

  return result;
}

export function navigate(
  date: Date,
  mode: ViewMode,
  direction: 'prev' | 'next',
): Date {
  if (mode === 'month') {
    return direction === 'next' ? addMonths(date, 1) : subMonths(date, 1);
  }
  return direction === 'next' ? addWeeks(date, 1) : subWeeks(date, 1);
}

export function formatMonthLabel(date: Date): string {
  return format(date, 'MMMM yyyy');
}

export function formatWeekLabel(date: Date): string {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return `${format(start, 'd MMM')} - ${format(end, 'd MMM yyyy')}`;
}

export { isSameDay, isSameMonth, isWithinInterval, format, addDays, startOfDay };
