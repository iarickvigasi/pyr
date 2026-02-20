'use client';

import Link from 'next/link';
import { CalendarDays, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface OtaBookingBadgeProps {
  bookingId: string;
  needsReview: boolean;
}

export function OtaBookingBadge({ bookingId, needsReview }: OtaBookingBadgeProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <Link href={`/bookings/${bookingId}`} className="inline-flex items-center gap-1.5">
        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
          <CalendarDays className="mr-1 h-3 w-3" />
          Booking created
        </Badge>
      </Link>
      {needsReview && (
        <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
          <AlertTriangle className="mr-1 h-3 w-3" />
          Needs Review
        </Badge>
      )}
    </div>
  );
}
