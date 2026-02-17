'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mail, Phone, Tag, Edit, Trash2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { GuestFormDialog } from './guest-form-dialog';
import { useGuest, useDeleteGuest } from '@/lib/hooks/use-guests';
import { formatCurrency, formatDate } from '@/lib/format';
import { toast } from 'sonner';

interface GuestDetailProps {
  id: string;
}

export function GuestDetail({ id }: GuestDetailProps) {
  const router = useRouter();
  const { data, isLoading, error } = useGuest(id);
  const deleteGuest = useDeleteGuest();
  const { confirmDialog, confirm } = useConfirmDialog();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete Guest?',
      description: `Are you sure you want to delete ${data?.name}? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'destructive',
    });

    if (confirmed) {
      try {
        await deleteGuest.mutateAsync(id);
        toast.success('Guest deleted successfully');
        router.push('/guests');
      } catch (error) {
        toast.error('Failed to delete guest');
      }
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.push('/guests')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Guests
        </Button>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <p>Error loading guest. Please try again.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.push('/guests')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Guests
        </Button>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  const guest = data;
  if (!guest) return null;

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => router.push('/guests')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Guests
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Main Content */}
          <div className="md:col-span-2 space-y-6">
            {/* Guest Info */}
            <Card>
              <CardHeader>
                <CardTitle>{guest.name}</CardTitle>
                <CardDescription>Guest Information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Email</p>
                    {guest.email ? (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <a href={`mailto:${guest.email}`} className="text-sm hover:underline">
                          {guest.email}
                        </a>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">-</p>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Phone</p>
                    {guest.phone ? (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <a href={`tel:${guest.phone}`} className="text-sm hover:underline">
                          {guest.phone}
                        </a>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">-</p>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Language</p>
                    <Badge variant="outline">{guest.language.toUpperCase()}</Badge>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Source</p>
                    {guest.source ? (
                      <Badge variant="outline">{guest.source}</Badge>
                    ) : (
                      <p className="text-sm text-muted-foreground">-</p>
                    )}
                  </div>
                </div>

                {guest.tags.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {guest.tags.map((tag: string) => (
                        <Badge key={tag} variant="secondary">
                          <Tag className="mr-1 h-3 w-3" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {guest.dietaryNeeds && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Dietary Needs</p>
                    <p className="text-sm">{guest.dietaryNeeds}</p>
                  </div>
                )}

                {guest.notes && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{guest.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Booking History */}
            <Card>
              <CardHeader>
                <CardTitle>Booking History</CardTitle>
                <CardDescription>Past and upcoming stays</CardDescription>
              </CardHeader>
              <CardContent>
                {guest.bookings && guest.bookings.length > 0 ? (
                  <div className="space-y-4">
                    {guest.bookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => router.push(`/bookings/${booking.id}`)}
                      >
                        <div className="flex items-center gap-4">
                          <Calendar className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">
                              {formatDate(booking.checkIn)} - {formatDate(booking.checkOut)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatCurrency(booking.totalPrice)}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={
                            booking.status === 'confirmed' || booking.status === 'checked_in'
                              ? 'default'
                              : booking.status === 'cancelled'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {booking.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No bookings yet</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Event Registrations */}
            <Card>
              <CardHeader>
                <CardTitle>Event Registrations</CardTitle>
                <CardDescription>Upcoming events</CardDescription>
              </CardHeader>
              <CardContent>
                {guest.eventBookings && guest.eventBookings.length > 0 ? (
                  <div className="space-y-3">
                    {guest.eventBookings.map((eventBooking) => (
                      <div
                        key={eventBooking.id}
                        className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => router.push(`/events/${eventBooking.event.id}`)}
                      >
                        <p className="font-medium text-sm">{eventBooking.event.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(eventBooking.event.date)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-4">No events</p>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Total Bookings</p>
                  <p className="text-2xl font-bold">{guest.bookings?.length ?? 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Events</p>
                  <p className="text-2xl font-bold">{guest.eventBookings?.length ?? 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Member Since</p>
                  <p className="text-sm">{formatDate(guest.createdAt)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <GuestFormDialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} guest={guest} />
      {confirmDialog}
    </>
  );
}
