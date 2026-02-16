"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useCreateBooking, useUpdateBooking, useAvailability, useGuests } from '@/lib/hooks/use-bookings';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { formatCurrency } from '@/lib/format';
import { toast } from 'sonner';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const bookingSchema = z.object({
  guestId: z.string().min(1, 'Guest is required'),
  roomId: z.string().min(1, 'Room is required'),
  checkIn: z.string().min(1, 'Check-in date is required'),
  checkOut: z.string().min(1, 'Check-out date is required'),
  status: z.enum(['inquiry', 'confirmed']),
  totalPrice: z.coerce.number().int().min(0, 'Price must be positive'),
  source: z.string().optional(),
  notes: z.string().optional(),
});

type BookingFormData = z.infer<typeof bookingSchema>;

interface BookingFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking?: {
    id: string;
    guestId: string;
    roomId: string;
    checkIn: string;
    checkOut: string;
    status: string;
    totalPrice: number;
    source: string | null;
    notes: string | null;
    guest: { id: string; name: string };
  };
}

export function BookingFormDialog({
  open,
  onOpenChange,
  booking,
}: BookingFormDialogProps) {
  const isEdit = !!booking;
  const createBooking = useCreateBooking();
  const updateBooking = useUpdateBooking();

  const [guestSearch, setGuestSearch] = useState('');
  const [guestOpen, setGuestOpen] = useState(false);
  const [selectedGuestName, setSelectedGuestName] = useState(booking?.guest.name ?? '');

  const debouncedSearch = useDebounce(guestSearch, 300);
  const guestsQuery = useGuests(debouncedSearch);

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      guestId: booking?.guestId ?? '',
      roomId: booking?.roomId ?? '',
      checkIn: booking?.checkIn?.split('T')[0] ?? '',
      checkOut: booking?.checkOut?.split('T')[0] ?? '',
      status: (booking?.status as 'inquiry' | 'confirmed') ?? 'inquiry',
      totalPrice: booking?.totalPrice ?? 0,
      source: booking?.source ?? '',
      notes: booking?.notes ?? '',
    },
  });

  const checkIn = form.watch('checkIn');
  const checkOut = form.watch('checkOut');
  const availabilityQuery = useAvailability(checkIn, checkOut);

  useEffect(() => {
    if (availabilityQuery.data?.data && !isEdit) {
      const roomId = form.getValues('roomId');
      const match = availabilityQuery.data.data.find((r) => r.roomId === roomId);
      if (match) {
        form.setValue('totalPrice', match.totalPrice);
      }
    }
  }, [availabilityQuery.data, form, isEdit]);

  const onSubmit = async (data: BookingFormData) => {
    try {
      if (isEdit) {
        await updateBooking.mutateAsync({ id: booking.id, ...data });
        toast.success('Booking updated');
      } else {
        await createBooking.mutateAsync(data);
        toast.success('Booking created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save booking');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Booking' : 'New Booking'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="guestId"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Guest</FormLabel>
                  <Popover open={guestOpen} onOpenChange={setGuestOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            'w-full justify-between',
                            !field.value && 'text-muted-foreground',
                          )}
                        >
                          {selectedGuestName || 'Select guest...'}
                          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
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
                                onSelect={() => {
                                  field.onChange(g.id);
                                  setSelectedGuestName(g.name);
                                  setGuestOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    field.value === g.id ? 'opacity-100' : 'opacity-0',
                                  )}
                                />
                                <span>{g.name}</span>
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
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="checkIn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Check-in</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="checkOut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Check-out</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="roomId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Room</FormLabel>
                  {availabilityQuery.data?.data ? (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        const match = availabilityQuery.data?.data.find((r) => r.roomId === v);
                        if (match) form.setValue('totalPrice', match.totalPrice);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select available room" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availabilityQuery.data.data.map((r) => (
                          <SelectItem key={r.roomId} value={r.roomId}>
                            {r.roomName} ({r.roomTypeName}) &mdash;{' '}
                            {formatCurrency(r.totalPrice)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <>
                      <FormControl>
                        <Input {...field} placeholder="Select dates first to see available rooms" disabled />
                      </FormControl>
                      {checkIn && checkOut && availabilityQuery.isLoading && (
                        <p className="text-xs text-muted-foreground">Checking availability...</p>
                      )}
                    </>
                  )}
                  {availabilityQuery.data?.data.length === 0 && (
                    <Badge variant="destructive" className="text-xs">No rooms available</Badge>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="totalPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Price (cents)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                  </FormControl>
                  {field.value > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(field.value)}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="inquiry">Inquiry</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., email, phone, website" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Any additional notes..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createBooking.isPending || updateBooking.isPending}
              >
                {(createBooking.isPending || updateBooking.isPending)
                  ? 'Saving...'
                  : isEdit
                    ? 'Update'
                    : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
