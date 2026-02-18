"use client";

import { useEffect } from 'react';
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
import { useCreateEvent, useUpdateEvent } from '@/lib/hooks/use-events';
import { EVENT_TYPES } from '@pyr/shared';
import { toast } from 'sonner';

const typeLabels: Record<string, string> = {
  puppy_yoga: 'Puppy Yoga',
  beach_walk: 'Beach Walk',
  coffee_cake_cuddles: 'Coffee & Cuddles',
  retreat: 'Retreat',
};

const defaultLocations: Record<string, string> = {
  puppy_yoga: 'Rooftop Terrace',
  beach_walk: 'Coral Bay Beach',
  coffee_cake_cuddles: 'Garden Lounge',
};

const eventSchema = z.object({
  type: z.string().min(1, 'Type is required'),
  title: z.string().min(1, 'Title is required'),
  date: z.string().min(1, 'Date is required'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format'),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1'),
  location: z.string().optional(),
  description: z.string().optional(),
});

type EventFormData = z.infer<typeof eventSchema>;

interface EventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: {
    id: string;
    type: string;
    title: string;
    date: string;
    time: string;
    capacity: number;
    location: string | null;
    description: string | null;
  };
}

export function EventFormDialog({
  open,
  onOpenChange,
  event,
}: EventFormDialogProps) {
  const isEdit = !!event;
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      type: event?.type ?? '',
      title: event?.title ?? '',
      date: event?.date?.split('T')[0] ?? '',
      time: event?.time ?? '10:00',
      capacity: event?.capacity ?? 8,
      location: event?.location ?? '',
      description: event?.description ?? '',
    },
  });

  // Reset form values whenever the dialog opens or the event prop changes
  useEffect(() => {
    if (open) {
      form.reset({
        type: event?.type ?? '',
        title: event?.title ?? '',
        date: event?.date?.split('T')[0] ?? '',
        time: event?.time ?? '10:00',
        capacity: event?.capacity ?? 8,
        location: event?.location ?? '',
        description: event?.description ?? '',
      });
    }
  }, [open, event]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedType = form.watch('type');

  const handleTypeChange = (type: string) => {
    form.setValue('type', type);
    if (!isEdit && !form.getValues('title')) {
      form.setValue('title', typeLabels[type] ?? type);
    }
    if (!isEdit && !form.getValues('location')) {
      form.setValue('location', defaultLocations[type] ?? '');
    }
  };

  const onSubmit = async (data: EventFormData) => {
    try {
      if (isEdit) {
        await updateEvent.mutateAsync({ id: event.id, ...data });
        toast.success('Event updated');
      } else {
        await createEvent.mutateAsync(data);
        toast.success('Event created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save event');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Event' : 'New Event'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={handleTypeChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {EVENT_TYPES.filter((t) => t !== 'retreat').map((t) => (
                        <SelectItem key={t} value={t}>
                          {typeLabels[t] ?? t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Capacity</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createEvent.isPending || updateEvent.isPending}
              >
                {(createEvent.isPending || updateEvent.isPending)
                  ? 'Saving...'
                  : isEdit ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
