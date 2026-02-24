"use client";

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BOOKING_STATUSES } from '@pyr/shared';

interface BookingFiltersProps {
  status: string;
  paymentStatus: string;
  from: string;
  to: string;
  search: string;
  onStatusChange: (v: string) => void;
  onPaymentStatusChange: (v: string) => void;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onSearchChange: (v: string) => void;
}

export function BookingFilters({
  status,
  paymentStatus,
  from,
  to,
  search,
  onStatusChange,
  onPaymentStatusChange,
  onFromChange,
  onToChange,
  onSearchChange,
}: BookingFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {BOOKING_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s.replace('_', ' ')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={paymentStatus} onValueChange={onPaymentStatusChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="All payments" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All payments</SelectItem>
          <SelectItem value="paid">Paid</SelectItem>
          <SelectItem value="partial">Partial</SelectItem>
          <SelectItem value="unpaid">Unpaid</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="date"
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
        className="w-[150px]"
        placeholder="From"
      />
      <Input
        type="date"
        value={to}
        onChange={(e) => onToChange(e.target.value)}
        className="w-[150px]"
        placeholder="To"
      />
      <Input
        placeholder="Search guests..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-[200px]"
      />
    </div>
  );
}
