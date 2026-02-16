"use client";

import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EventTypeBadge } from './event-type-badge';
import { formatDate } from '@/lib/format';

interface EventRow {
  id: string;
  type: string;
  title: string;
  date: string;
  time: string;
  capacity: number;
  _count: { eventBookings: number };
}

export function EventTable({
  events,
  isLoading,
  onDelete,
}: {
  events: EventRow[];
  isLoading: boolean;
  onDelete: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No events found
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Time</TableHead>
          <TableHead>Capacity</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((e) => (
          <TableRow key={e.id}>
            <TableCell>
              <Link href={`/events/${e.id}`} className="font-medium hover:underline">
                {e.title}
              </Link>
            </TableCell>
            <TableCell>
              <EventTypeBadge type={e.type} />
            </TableCell>
            <TableCell>{formatDate(e.date)}</TableCell>
            <TableCell>{e.time}</TableCell>
            <TableCell>
              <span className={e._count.eventBookings >= e.capacity ? 'text-red-600 font-medium' : ''}>
                {e._count.eventBookings}/{e.capacity}
              </span>
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/events/${e.id}`}>View Details</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => onDelete(e.id)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
