"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import {
  useEvent,
  useEventRegistrations,
  useRegisterGuest,
  useDeleteEvent,
} from '@/lib/hooks/use-events';
import { useGuests } from '@/lib/hooks/use-guests';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { EventTypeBadge } from './event-type-badge';
import { EventFormDialog } from './event-form-dialog';
import { formatDate } from '@/lib/format';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export function EventDetail({ id }: { id: string }) {
  const { data, isLoading } = useEvent(id);
  const registrationsQuery = useEventRegistrations(id);
  const registerGuest = useRegisterGuest();
  const deleteEvent = useDeleteEvent();
  const router = useRouter();

  const [showEdit, setShowEdit] = useState(false);
  const [guestSearch, setGuestSearch] = useState('');
  const [guestOpen, setGuestOpen] = useState(false);
  const debouncedSearch = useDebounce(guestSearch, 300);
  const guestsQuery = useGuests({ search: debouncedSearch || undefined, limit: 10 });

  const event = data?.data;

  const handleRegister = async (guestId: string) => {
    try {
      await registerGuest.mutateAsync({ eventId: id, guestId });
      toast.success('Guest registered');
      setGuestOpen(false);
      setGuestSearch('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to register');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteEvent.mutateAsync(id);
      toast.success('Event deleted');
      router.push('/events');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
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

  if (!event) {
    return <div className="text-muted-foreground">Event not found</div>;
  }

  const registrations = registrationsQuery.data?.data ?? [];
  const confirmedCount = event._count.eventBookings;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/events">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{event.title}</h1>
          <p className="text-muted-foreground">
            {formatDate(event.date)} at {event.time}
          </p>
        </div>
        <EventTypeBadge type={event.type} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Date: </span>
              {formatDate(event.date)}
            </div>
            <div>
              <span className="text-muted-foreground">Time: </span>
              {event.time}
            </div>
            {event.location && (
              <div>
                <span className="text-muted-foreground">Location: </span>
                {event.location}
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Capacity: </span>
              <span className={confirmedCount >= event.capacity ? 'text-red-600 font-medium' : ''}>
                {confirmedCount} / {event.capacity}
              </span>
            </div>
            {event.description && (
              <div>
                <span className="text-muted-foreground">Description: </span>
                <p className="mt-1 whitespace-pre-wrap">{event.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Registrations</CardTitle>
            <Popover open={guestOpen} onOpenChange={setGuestOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="mr-1 h-3 w-3" />
                  Register Guest
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="end">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search guests..."
                    value={guestSearch}
                    onValueChange={setGuestSearch}
                  />
                  <CommandList>
                    <CommandEmpty>No guests found</CommandEmpty>
                    <CommandGroup>
                      {guestsQuery.data?.data.map((g) => (
                        <CommandItem
                          key={g.id}
                          value={g.id}
                          onSelect={() => handleRegister(g.id)}
                        >
                          {g.name}
                          {g.email && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {g.email}
                            </span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </CardHeader>
          <CardContent>
            {registrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No registrations yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guest</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registrations.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/guests/${r.guestId}`} className="hover:underline">
                          {r.guest.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === 'confirmed'
                              ? 'default'
                              : r.status === 'waitlisted'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setShowEdit(true)}>
          Edit Event
        </Button>
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={deleteEvent.isPending}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>

      {showEdit && (
        <EventFormDialog
          open={showEdit}
          onOpenChange={setShowEdit}
          event={event}
        />
      )}
    </div>
  );
}
