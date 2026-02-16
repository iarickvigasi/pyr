"use client";

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; className: string }> = {
  inquiry: { label: 'Inquiry', className: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-800 border-green-300' },
  checked_in: { label: 'Checked In', className: 'bg-blue-100 text-blue-800 border-blue-300' },
  checked_out: { label: 'Checked Out', className: 'bg-gray-100 text-gray-800 border-gray-300' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-800 border-red-300' },
};

export function BookingStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { label: status, className: '' };
  return (
    <Badge variant="outline" className={cn('font-medium', config.className)}>
      {config.label}
    </Badge>
  );
}
