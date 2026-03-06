'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Mail, Phone, Tag, Edit, Trash2, Calendar,
  GitMerge, MessageSquare, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { GuestFormDialog } from './guest-form-dialog';
import { GuestMergeDialog } from './guest-merge-dialog';
import { useGuest, useDeleteGuest, useUpdateGuest } from '@/lib/hooks/use-guests';
import { formatCurrency, formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { toast } from 'sonner';

interface GuestDetailProps {
  id: string;
}

export function GuestDetail({ id }: GuestDetailProps) {
  const router = useRouter();
  const { data, isLoading, error } = useGuest(id);
  const deleteGuest = useDeleteGuest();
  const updateGuest = useUpdateGuest(id);
  const { confirmDialog, confirm } = useConfirmDialog();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteText, setNoteText] = useState('');

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
      } catch {
        toast.error('Failed to delete guest');
      }
    }
  };

  const handleSaveNote = async () => {
    if (!noteText.trim()) return;
    const timestamp = formatDateTime(new Date().toISOString());
    const separator = data?.notes ? `\n\n---\n[${timestamp}]\n` : `[${timestamp}]\n`;
    const updatedNotes = (data?.notes ?? '') + separator + noteText.trim();
    try {
      await updateGuest.mutateAsync({ notes: updatedNotes });
      setNoteText('');
      setIsAddingNote(false);
      toast.success('Note saved');
    } catch {
      toast.error('Failed to save note');
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

  // Compute stats
  const totalRevenue = (guest.bookings ?? [])
    .filter((b) => b.status !== 'cancelled')
    .reduce((sum, b) => sum + b.totalPrice, 0);

  // Synthesize activity timeline
  const timelineItems: Array<{
    date: string;
    icon: string;
    label: string;
    href?: string;
  }> = [
    { date: guest.createdAt, icon: '🎉', label: 'Profile created' },
    ...(guest.bookings ?? []).map((b) => ({
      date: b.createdAt ?? b.checkIn,
      icon: '🏠',
      label: `Booking — ${formatDate(b.checkIn)} to ${formatDate(b.checkOut)} · ${b.room.name}`,
      href: `/bookings/${b.id}`,
    })),
    ...(guest.eventBookings ?? []).map((eb) => ({
      date: eb.createdAt ?? eb.event.date,
      icon: '📅',
      label: `Registered for ${eb.event.title}`,
      href: `/events/${eb.event.id}`,
    })),
    ...(guest.conversations ?? []).map((c) => ({
      date: c.createdAt,
      icon: '💬',
      label: `Conversation started via ${c.channel}`,
      href: `/inbox?conversation=${c.id}`,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
            <Button variant="outline" onClick={() => setIsMergeDialogOpen(true)}>
              <GitMerge className="mr-2 h-4 w-4" />
              Merge duplicate...
            </Button>
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
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {guest.notes ? (
                  <p className="text-sm whitespace-pre-wrap">{guest.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                )}

                {isAddingNote ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Add an internal note..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleSaveNote}
                        disabled={!noteText.trim() || updateGuest.isPending}
                      >
                        {updateGuest.isPending ? 'Saving...' : 'Save Note'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setIsAddingNote(false); setNoteText(''); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setIsAddingNote(true)}>
                    Add Note
                  </Button>
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
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            router.push(`/bookings/${booking.id}`);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex items-center gap-4">
                          <Calendar className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">
                              {formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {booking.room.name} · {formatCurrency(booking.totalPrice)}
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

            {/* Conversations */}
            <Card>
              <CardHeader>
                <CardTitle>Conversations</CardTitle>
                <CardDescription>Message threads with this guest</CardDescription>
              </CardHeader>
              <CardContent>
                {guest.conversations && guest.conversations.length > 0 ? (
                  <div className="space-y-2">
                    {guest.conversations.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => router.push(`/inbox?conversation=${c.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            router.push(`/inbox?conversation=${c.id}`);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex items-center gap-3">
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">
                              {c.subject ?? '(No subject)'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              via {c.channel}
                              {c.lastMessageAt
                                ? ` · ${formatRelative(c.lastMessageAt)}`
                                : ''}
                            </p>
                          </div>
                        </div>
                        <Badge variant={c.status === 'open' ? 'default' : 'secondary'}>
                          {c.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    No conversations
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Activity Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {timelineItems.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    No activity yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {timelineItems.map((item, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className="text-lg">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                          {item.href ? (
                            <button
                              className="text-sm text-left hover:underline truncate w-full"
                              onClick={() => router.push(item.href!)}
                            >
                              {item.label}
                            </button>
                          ) : (
                            <p className="text-sm">{item.label}</p>
                          )}
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <Clock className="h-3 w-3" />
                            {formatRelative(item.date)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
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
                <CardDescription>Upcoming and past events</CardDescription>
              </CardHeader>
              <CardContent>
                {guest.eventBookings && guest.eventBookings.length > 0 ? (
                  <div className="space-y-3">
                    {guest.eventBookings.map((eventBooking) => (
                      <div
                        key={eventBooking.id}
                        className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => router.push(`/events/${eventBooking.event.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            router.push(`/events/${eventBooking.event.id}`);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <p className="font-medium text-sm">{eventBooking.event.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(eventBooking.event.date)}
                        </p>
                        <Badge variant="outline" className="text-xs mt-1">
                          {eventBooking.status}
                        </Badge>
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
                  <p className="text-2xl font-bold">{guest._count?.bookings ?? guest.bookings?.length ?? 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Events</p>
                  <p className="text-2xl font-bold">{guest._count?.eventBookings ?? guest.eventBookings?.length ?? 0}</p>
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

      {/* Merge Dialog */}
      <GuestMergeDialog
        open={isMergeDialogOpen}
        onOpenChange={setIsMergeDialogOpen}
        primaryGuest={guest}
      />

      {confirmDialog}
    </>
  );
}
