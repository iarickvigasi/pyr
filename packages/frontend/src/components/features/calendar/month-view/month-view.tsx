"use client";

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { CalendarBookingItem, CalendarEventItem } from '../shared/calendar-types';
import {
  getVisibleRange,
  getWeeksInRange,
  splitBookingIntoWeekSegments,
  assignSlotIndexes,
  isSameDay,
  isSameMonth,
  format,
  addDays,
} from '../shared/calendar-utils';
import { getRoomTypeColor, eventTypeStyles, getStatusModifier } from '../shared/calendar-colors';
import { BookingPopover, EventPopover } from '../shared/calendar-item-popover';

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_VISIBLE_ITEMS = 3;

interface MonthViewProps {
  currentDate: Date;
  bookings: CalendarBookingItem[];
  events: CalendarEventItem[];
  onDateClick: (date: Date) => void;
}

export function MonthView({
  currentDate,
  bookings,
  events,
  onDateClick,
}: MonthViewProps) {
  const { start, end } = useMemo(
    () => getVisibleRange(currentDate, 'month'),
    [currentDate],
  );
  const weeks = useMemo(() => getWeeksInRange(start, end), [start, end]);
  const today = new Date();

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 bg-muted">
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => {
        const weekStart = week[0]!;
        const weekEnd = week[6]!;

        const weekSegments = bookings
          .map((booking) => {
            const seg = splitBookingIntoWeekSegments(booking, weekStart, weekEnd);
            if (!seg) return null;
            return { booking, ...seg };
          })
          .filter(Boolean) as Array<{
          booking: CalendarBookingItem;
          startCol: number;
          endCol: number;
        }>;

        const bars = assignSlotIndexes(weekSegments);

        const dayEvents = week.map((day) =>
          events.filter((e) => isSameDay(e.date, day)),
        );

        const maxSlots = bars.length > 0
          ? Math.max(...bars.map((b) => b.slotIndex)) + 1
          : 0;

        return (
          <div key={wi} className="grid grid-cols-7 border-t relative">
            {week.map((day, di) => {
              const isToday = isSameDay(day, today);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const dayEvts = dayEvents[di] ?? [];

              const barsInDay = bars.filter(
                (b) => b.startCol <= di && b.endCol > di,
              );
              const totalItems = barsInDay.length + dayEvts.length;
              const overflow = totalItems > MAX_VISIBLE_ITEMS
                ? totalItems - MAX_VISIBLE_ITEMS + 1
                : 0;

              return (
                <div
                  key={di}
                  className={cn(
                    'min-h-[100px] border-r last:border-r-0 p-1 cursor-pointer hover:bg-accent/50 transition-colors',
                    !isCurrentMonth && 'bg-muted/30 text-muted-foreground',
                  )}
                  onClick={() => onDateClick(day)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onDateClick(day);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div
                    className={cn(
                      'text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                      isToday && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {bars
                      .filter((b) => b.startCol === di)
                      .slice(0, MAX_VISIBLE_ITEMS - (dayEvts.length > 0 ? 1 : 0))
                      .map((bar) => {
                        const color = getRoomTypeColor(bar.booking.roomTypeName);
                        const statusMod = getStatusModifier(bar.booking.status);
                        const span = bar.endCol - bar.startCol;
                        return (
                          <BookingPopover key={bar.booking.id} booking={bar.booking}>
                            <div
                              className={cn(
                                'text-[10px] leading-tight px-1 py-0.5 rounded truncate border',
                                color.bg,
                                color.border,
                                color.text,
                                statusMod,
                              )}
                              style={{
                                width: span > 1 ? `calc(${span * 100}% + ${(span - 1) * 1}px)` : '100%',
                                position: span > 1 ? 'relative' : 'static',
                                zIndex: 10,
                              }}
                            >
                              {bar.booking.guestName}
                            </div>
                          </BookingPopover>
                        );
                      })}
                    {dayEvts
                      .slice(0, overflow > 0 ? MAX_VISIBLE_ITEMS - barsInDay.length - 1 : undefined)
                      .map((evt) => {
                        const style = eventTypeStyles[evt.type] ?? eventTypeStyles.puppy_yoga!;
                        return (
                          <EventPopover key={evt.id} event={evt}>
                            <div
                              className={cn(
                                'text-[10px] leading-tight px-1 py-0.5 rounded truncate border',
                                style.bg,
                                style.border,
                                style.text,
                              )}
                            >
                              {evt.time} {evt.title}
                            </div>
                          </EventPopover>
                        );
                      })}
                    {overflow > 0 && (
                      <div className="text-[10px] text-muted-foreground px-1">
                        +{overflow} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
