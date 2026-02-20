"use client";

import Link from 'next/link';
import { AlertTriangle, MoreHorizontal } from 'lucide-react';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BookingStatusBadge } from './booking-status-badge';
import { formatDate, formatCurrency } from '@/lib/format';

interface BookingRow {
  id: string;
  checkIn: string;
  checkOut: string;
  status: string;
  totalPrice: number;
  needsReview?: boolean;
  guest: { id: string; name: string };
  room: { name: string; roomType: { name: string } };
}

const STATUS_TRANSITIONS: Record<string, Array<{ label: string; status: string }>> = {
  inquiry: [
    { label: 'Confirm', status: 'confirmed' },
    { label: 'Cancel', status: 'cancelled' },
  ],
  confirmed: [
    { label: 'Check In', status: 'checked_in' },
    { label: 'Cancel', status: 'cancelled' },
  ],
  checked_in: [
    { label: 'Check Out', status: 'checked_out' },
    { label: 'Cancel', status: 'cancelled' },
  ],
};

export function BookingTable({
  bookings,
  isLoading,
  onStatusChange,
}: {
  bookings: BookingRow[];
  isLoading: boolean;
  onStatusChange: (id: string, status: string) => void;
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

  if (bookings.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No bookings found
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Guest</TableHead>
          <TableHead>Room</TableHead>
          <TableHead>Check-in</TableHead>
          <TableHead>Check-out</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {bookings.map((b) => {
          const transitions = STATUS_TRANSITIONS[b.status] ?? [];
          return (
            <TableRow key={b.id}>
              <TableCell>
                <Link href={`/bookings/${b.id}`} className="font-medium hover:underline">
                  {b.guest.name}
                </Link>
              </TableCell>
              <TableCell>{b.room.name}</TableCell>
              <TableCell>{formatDate(b.checkIn)}</TableCell>
              <TableCell>{formatDate(b.checkOut)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <BookingStatusBadge status={b.status} />
                  {b.needsReview && (
                    <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700 text-xs">
                      <AlertTriangle className="mr-0.5 h-3 w-3" />
                      Review
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(b.totalPrice)}
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
                      <Link href={`/bookings/${b.id}`}>View Details</Link>
                    </DropdownMenuItem>
                    {transitions.length > 0 && <DropdownMenuSeparator />}
                    {transitions.map((t) => (
                      <DropdownMenuItem
                        key={t.status}
                        onClick={() => onStatusChange(b.id, t.status)}
                      >
                        {t.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
