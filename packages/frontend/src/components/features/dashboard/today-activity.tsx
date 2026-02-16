"use client";

import Link from 'next/link';
import { LogIn, LogOut, Calendar } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface TodayBooking {
  id: string;
  guestName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
}

interface TodayEvent {
  id: string;
  type: string;
  title: string;
  time: string;
  capacity: number;
  registeredCount: number;
}

interface TodayData {
  checkIns: TodayBooking[];
  checkOuts: TodayBooking[];
  events: TodayEvent[];
}

export function TodayActivity({
  data,
  isLoading,
}: {
  data?: TodayData;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  const checkIns = data?.checkIns ?? [];
  const checkOuts = data?.checkOuts ?? [];
  const events = data?.events ?? [];
  const isEmpty = checkIns.length === 0 && checkOuts.length === 0 && events.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s Activity</CardTitle>
        {isEmpty && (
          <CardDescription>No activity scheduled for today</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {checkIns.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm font-medium">
              <LogIn className="h-4 w-4 text-green-600" />
              Check-ins ({checkIns.length})
            </div>
            <ul className="space-y-1">
              {checkIns.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/bookings/${b.id}`}
                    className="text-sm hover:underline"
                  >
                    {b.guestName} &mdash; {b.roomName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {checkOuts.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm font-medium">
              <LogOut className="h-4 w-4 text-orange-600" />
              Check-outs ({checkOuts.length})
            </div>
            <ul className="space-y-1">
              {checkOuts.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/bookings/${b.id}`}
                    className="text-sm hover:underline"
                  >
                    {b.guestName} &mdash; {b.roomName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {events.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm font-medium">
              <Calendar className="h-4 w-4 text-blue-600" />
              Events ({events.length})
            </div>
            <ul className="space-y-1">
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-2">
                  <Link
                    href={`/events/${e.id}`}
                    className="text-sm hover:underline"
                  >
                    {e.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">{e.time}</span>
                  <Badge variant="secondary" className="text-xs">
                    {e.registeredCount}/{e.capacity}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
