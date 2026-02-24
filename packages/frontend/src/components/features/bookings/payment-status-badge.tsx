'use client';

import type { ReactElement } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const paymentStatusConfig: Record<string, { label: string; className: string }> = {
  paid:    { label: 'Paid',    className: 'bg-green-100 text-green-800 border-green-300' },
  partial: { label: 'Partial', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  unpaid:  { label: 'Unpaid',  className: 'bg-red-100 text-red-800 border-red-300' },
};

export function PaymentStatusBadge({ status }: { status: string }): ReactElement {
  const config = paymentStatusConfig[status] ?? { label: status, className: '' };
  return (
    <Badge variant="outline" className={cn('font-medium', config.className)}>
      {config.label}
    </Badge>
  );
}
