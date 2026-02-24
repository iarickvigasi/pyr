"use client";

import Link from 'next/link';
import { ArrowLeft, Mail, AlertTriangle } from 'lucide-react';
import { useBooking, useUpdateBooking } from '@/lib/hooks/use-bookings';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { BookingStatusBadge } from './booking-status-badge';
import { PaymentPanel } from './payment-panel';
import { formatDate, formatDateRange, formatCurrency, nightsBetween } from '@/lib/format';
import { toast } from 'sonner';

const STATUS_TRANSITIONS: Record<string, Array<{ label: string; status: string; variant?: 'default' | 'destructive' | 'outline' }>> = {
  inquiry: [
    { label: 'Confirm Booking', status: 'confirmed' },
    { label: 'Cancel', status: 'cancelled', variant: 'destructive' },
  ],
  confirmed: [
    { label: 'Check In', status: 'checked_in' },
    { label: 'Cancel', status: 'cancelled', variant: 'destructive' },
  ],
  checked_in: [
    { label: 'Check Out', status: 'checked_out' },
    { label: 'Cancel', status: 'cancelled', variant: 'destructive' },
  ],
};

export function BookingDetail({ id }: { id: string }) {
  const { data, isLoading } = useBooking(id);
  const updateBooking = useUpdateBooking();

  const booking = data?.data;

  const handleStatusChange = async (status: string) => {
    try {
      await updateBooking.mutateAsync({ id, status });
      toast.success(`Booking ${status.replace('_', ' ')}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!booking) {
    return <div className="text-muted-foreground">Booking not found</div>;
  }

  const transitions = STATUS_TRANSITIONS[booking.status] ?? [];
  const nights = nightsBetween(booking.checkIn, booking.checkOut);

  // Multi-guest display: prefer bookingGuests, fall back to legacy guest
  const guests = booking.bookingGuests && booking.bookingGuests.length > 0
    ? booking.bookingGuests.map((bg) => bg.guest)
    : [booking.guest];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/bookings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Booking</h1>
          <p className="text-muted-foreground">
            {formatDateRange(booking.checkIn, booking.checkOut)} ({nights} night{nights !== 1 ? 's' : ''})
          </p>
        </div>
        <BookingStatusBadge status={booking.status} />
      </div>

      {/* OTA booking banners */}
      {booking.sourceConversationId && (
        <Alert>
          <Mail className="h-4 w-4" />
          <AlertTitle>Created from OTA email</AlertTitle>
          <AlertDescription>
            This booking was automatically created from an OTA email notification.{' '}
            <Link
              href={`/inbox?conversation=${booking.sourceConversationId}`}
              className="font-medium underline underline-offset-4 hover:text-primary"
            >
              View source email
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {booking.needsReview && (
        <Alert variant="destructive" className="border-orange-200 bg-orange-50 text-orange-900 [&>svg]:text-orange-600">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Needs Review</AlertTitle>
          <AlertDescription>
            This booking may have incomplete data from automatic parsing. Please review
            and fill in any missing fields (dates, pricing, room assignment).
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {guests.length === 1 ? 'Guest' : 'Guests'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {guests.map((g, idx) => (
              <div key={g.id} className={idx > 0 ? 'border-t pt-3' : ''}>
                <div>
                  <Link href={`/guests/${g.id}`} className="font-medium hover:underline">
                    {g.name}
                  </Link>
                </div>
                {g.email && (
                  <div className="text-muted-foreground">{g.email}</div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Room & Pricing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Room: </span>
              <span className="font-medium">{booking.room.name}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Type: </span>
              {booking.room.roomType.name}
            </div>
            <div>
              <span className="text-muted-foreground">Total: </span>
              <span className="font-semibold text-lg">
                {formatCurrency(booking.totalPrice)}
              </span>
            </div>
            {booking.source && (
              <div>
                <span className="text-muted-foreground">Source: </span>
                {booking.source}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {booking.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{booking.notes}</p>
          </CardContent>
        </Card>
      )}

      {transitions.length > 0 && (
        <>
          <Separator />
          <div className="flex gap-2">
            {transitions.map((t) => (
              <Button
                key={t.status}
                variant={(t.variant as 'default' | 'destructive' | 'outline') ?? 'default'}
                onClick={() => handleStatusChange(t.status)}
                disabled={updateBooking.isPending}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </>
      )}

      <PaymentPanel
        bookingId={booking.id}
        payments={booking.payments ?? []}
        paymentSummary={booking.paymentSummary ?? { totalPrice: booking.totalPrice, totalPaid: 0, balanceDue: booking.totalPrice }}
      />
    </div>
  );
}
