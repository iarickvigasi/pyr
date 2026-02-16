"use client";

import Link from 'next/link';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { BookingStatusBadge } from '@/components/features/bookings/booking-status-badge';
import { EventTypeBadge } from '@/components/features/events/event-type-badge';
import { formatDateRange } from '@/lib/format';
import type { CalendarBookingItem, CalendarEventItem } from './calendar-types';

export function BookingPopover({
  booking,
  children,
}: {
  booking: CalendarBookingItem;
  children: React.ReactNode;
}) {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-64" side="top">
        <div className="space-y-2">
          <div className="font-medium">{booking.guestName}</div>
          <div className="text-sm text-muted-foreground">
            {booking.roomName} ({booking.roomTypeName})
          </div>
          <div className="text-sm">
            {formatDateRange(booking.checkIn, booking.checkOut)}
          </div>
          <BookingStatusBadge status={booking.status} />
          <Link
            href={`/bookings/${booking.id}`}
            className="block text-xs text-primary hover:underline mt-1"
          >
            View details
          </Link>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function EventPopover({
  event,
  children,
}: {
  event: CalendarEventItem;
  children: React.ReactNode;
}) {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-56" side="top">
        <div className="space-y-2">
          <div className="font-medium">{event.title}</div>
          <EventTypeBadge type={event.type} />
          <div className="text-sm">{event.time}</div>
          <Badge variant="secondary" className="text-xs">
            {event.registeredCount}/{event.capacity}
          </Badge>
          <Link
            href={`/events/${event.id}`}
            className="block text-xs text-primary hover:underline mt-1"
          >
            View details
          </Link>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
