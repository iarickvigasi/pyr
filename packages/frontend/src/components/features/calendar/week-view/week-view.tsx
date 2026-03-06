"use client";

import { useMemo } from 'react';
import { startOfWeek, endOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import type { CalendarBookingItem, CalendarEventItem } from '../shared/calendar-types';
import {
  splitBookingIntoWeekSegments,
  assignSlotIndexes,
  isSameDay,
  format,
  addDays,
} from '../shared/calendar-utils';
import { getRoomTypeColor, eventTypeStyles, getStatusModifier } from '../shared/calendar-colors';
import { BookingPopover, EventPopover } from '../shared/calendar-item-popover';

const HOURS_START = 7;
const HOURS_END = 20;
const HOUR_HEIGHT = 48;

const eventDurations: Record<string, number> = {
  puppy_yoga: 90,
  beach_walk: 60,
  coffee_cake_cuddles: 90,
};

interface WeekViewProps {
  currentDate: Date;
  bookings: CalendarBookingItem[];
  events: CalendarEventItem[];
  onDateClick: (date: Date) => void;
}

export function WeekView({
  currentDate,
  bookings,
  events,
  onDateClick,
}: WeekViewProps) {
  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );
  const weekEnd = useMemo(
    () => endOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const today = new Date();

  const bars = useMemo(() => {
    const segs = bookings
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
    return assignSlotIndexes(segs);
  }, [bookings, weekStart, weekEnd]);

  const maxSlots = bars.length > 0 ? Math.max(...bars.map((b) => b.slotIndex)) + 1 : 0;
  const allDayHeight = Math.max(maxSlots * 24 + 8, 32);

  const hours = Array.from(
    { length: HOURS_END - HOURS_START },
    (_, i) => HOURS_START + i,
  );

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] bg-muted border-b">
        <div className="px-2 py-1.5" />
        {days.map((day, i) => (
          <div
            key={i}
            className={cn(
              'px-2 py-1.5 text-center text-xs font-medium border-l',
              isSameDay(day, today) && 'bg-primary/10',
            )}
          >
            <div>{format(day, 'EEE')}</div>
            <div
              className={cn(
                'text-sm',
                isSameDay(day, today) && 'text-primary font-bold',
              )}
            >
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* All-day area */}
      <div
        className="grid grid-cols-[60px_repeat(7,1fr)] border-b relative"
        style={{ minHeight: allDayHeight }}
      >
        <div className="px-2 py-1 text-[10px] text-muted-foreground">
          All day
        </div>
        {days.map((_, di) => (
          <div key={di} className="border-l relative" />
        ))}
        {bars.map((bar) => {
          const color = getRoomTypeColor(bar.booking.roomTypeName);
          const statusMod = getStatusModifier(bar.booking.status);
          const left = `calc(60px + ${(bar.startCol / 7) * 100}% * (7 / 7))`;

          return (
            <BookingPopover key={bar.booking.id} booking={bar.booking}>
              <div
                className={cn(
                  'absolute text-[10px] leading-tight px-1 py-0.5 rounded border truncate cursor-pointer',
                  color.bg,
                  color.border,
                  color.text,
                  statusMod,
                )}
                style={{
                  top: bar.slotIndex * 24 + 4,
                  left: `calc(60px + ${(bar.startCol * 100) / 7}%)`,
                  width: `calc(${((bar.endCol - bar.startCol) * 100) / 7}% - 4px)`,
                  height: 20,
                }}
              >
                {bar.booking.guestName} &mdash; {bar.booking.roomName}
              </div>
            </BookingPopover>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] relative">
        <div>
          {hours.map((h) => (
            <div
              key={h}
              className="text-[10px] text-muted-foreground text-right pr-2 border-b"
              style={{ height: HOUR_HEIGHT }}
            >
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {days.map((day, di) => {
          const dayEvents = events.filter((e) => isSameDay(e.date, day));
          return (
            <div
              key={di}
              className="border-l relative cursor-pointer"
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
              {hours.map((h) => (
                <div key={h} className="border-b" style={{ height: HOUR_HEIGHT }} />
              ))}
              {dayEvents.map((evt) => {
                const [hStr, mStr] = evt.time.split(':');
                const h = parseInt(hStr ?? '0', 10);
                const m = parseInt(mStr ?? '0', 10);
                const topMinutes = (h - HOURS_START) * 60 + m;
                const top = (topMinutes / 60) * HOUR_HEIGHT;
                const duration = eventDurations[evt.type] ?? 60;
                const height = (duration / 60) * HOUR_HEIGHT;
                const style = eventTypeStyles[evt.type] ?? eventTypeStyles.puppy_yoga!;

                if (h < HOURS_START || h >= HOURS_END) return null;

                return (
                  <EventPopover key={evt.id} event={evt}>
                    <div
                      className={cn(
                        'absolute left-1 right-1 rounded border px-1 py-0.5 text-[10px] leading-tight overflow-hidden cursor-pointer',
                        style.bg,
                        style.border,
                        style.text,
                      )}
                      style={{ top, height: Math.max(height, 20) }}
                    >
                      <div className="font-medium truncate">{evt.title}</div>
                      <div>{evt.time}</div>
                    </div>
                  </EventPopover>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
