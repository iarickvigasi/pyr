"use client";

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BookingFilters } from './booking-filters';
import { BookingTable } from './booking-table';
import { BookingFormDialog } from './booking-form-dialog';
import { useBookings, useUpdateBooking } from '@/lib/hooks/use-bookings';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { toast } from 'sonner';

type Booking = NonNullable<ReturnType<typeof useBookings>['data']>['data'][number];

export function BookingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [status, setStatus] = useState(searchParams.get('status') ?? 'all');
  const [paymentStatus, setPaymentStatus] = useState(searchParams.get('paymentStatus') ?? 'all');
  const [from, setFrom] = useState(searchParams.get('from') ?? '');
  const [to, setTo] = useState(searchParams.get('to') ?? '');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [showCreate, setShowCreate] = useState(searchParams.get('new') === '1');
  const [editBooking, setEditBooking] = useState<Booking | undefined>(undefined);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);

  const debouncedSearch = useDebounce(search);

  const params: Record<string, string | undefined> = {
    status: status === 'all' ? undefined : status,
    paymentStatus: paymentStatus === 'all' ? undefined : paymentStatus,
    from: from || undefined,
    to: to || undefined,
    search: debouncedSearch || undefined,
    cursor,
    limit: '20',
  };

  const { data, isLoading } = useBookings(params);
  const updateBooking = useUpdateBooking();

  // Reset pagination when filters change
  useEffect(() => {
    setCursor(undefined);
    setAllBookings([]);
  }, [status, paymentStatus, debouncedSearch, from, to]);

  // Accumulate pages
  useEffect(() => {
    if (data?.data) {
      if (!cursor) {
        setAllBookings(data.data);
      } else {
        setAllBookings((prev) => [...prev, ...data.data]);
      }
    }
  }, [data, cursor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const p = new URLSearchParams();
    if (status !== 'all') p.set('status', status);
    if (paymentStatus !== 'all') p.set('paymentStatus', paymentStatus);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (search) p.set('search', search);
    const qs = p.toString();
    router.replace(`/bookings${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [status, paymentStatus, from, to, search, router]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await updateBooking.mutateAsync({ id, status: newStatus });
      toast.success(`Booking ${newStatus.replace('_', ' ')}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleLoadMore = () => {
    if (data?.nextCursor) {
      setCursor(data.nextCursor);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bookings</h1>
        <Button onClick={() => { setEditBooking(undefined); setShowCreate(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          New Booking
        </Button>
      </div>

      <BookingFilters
        status={status}
        paymentStatus={paymentStatus}
        from={from}
        to={to}
        search={search}
        onStatusChange={setStatus}
        onPaymentStatusChange={setPaymentStatus}
        onFromChange={setFrom}
        onToChange={setTo}
        onSearchChange={setSearch}
      />

      <BookingTable
        bookings={allBookings}
        isLoading={isLoading}
        onStatusChange={handleStatusChange}
        onEdit={(b) => { setEditBooking(b as Booking); setShowCreate(true); }}
      />

      {data?.hasMore && (
        <div className="text-center">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}

      <BookingFormDialog
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) setEditBooking(undefined);
        }}
        booking={editBooking}
      />
    </div>
  );
}
