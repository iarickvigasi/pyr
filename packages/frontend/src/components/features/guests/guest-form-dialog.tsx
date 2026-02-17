'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateGuest, useUpdateGuest, type Guest } from '@/lib/hooks/use-guests';
import { toast } from 'sonner';

const guestFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  language: z.enum(['en', 'de']).default('en'),
  dietaryNeeds: z.string().optional(),
  source: z.string().optional(),
  tags: z.string().optional(), // Comma-separated tags
  notes: z.string().optional(),
});

type GuestFormData = z.infer<typeof guestFormSchema>;

interface GuestFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guest?: Guest;
}

export function GuestFormDialog({ open, onOpenChange, guest }: GuestFormDialogProps) {
  const isEditing = !!guest;
  const createGuest = useCreateGuest();
  const updateGuest = useUpdateGuest(guest?.id ?? '');

  const form = useForm<GuestFormData>({
    resolver: zodResolver(guestFormSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      language: 'en',
      dietaryNeeds: '',
      source: '',
      tags: '',
      notes: '',
    },
  });

  // Reset form when dialog opens/closes or guest changes
  useEffect(() => {
    if (open && guest) {
      form.reset({
        name: guest.name,
        email: guest.email ?? '',
        phone: guest.phone ?? '',
        language: (guest.language as 'en' | 'de') ?? 'en',
        dietaryNeeds: guest.dietaryNeeds ?? '',
        source: guest.source ?? '',
        tags: guest.tags.join(', '),
        notes: guest.notes ?? '',
      });
    } else if (!open) {
      form.reset();
    }
  }, [open, guest, form]);

  const onSubmit = async (data: GuestFormData) => {
    try {
      const payload = {
        ...data,
        email: data.email || undefined,
        phone: data.phone || undefined,
        dietaryNeeds: data.dietaryNeeds || undefined,
        source: data.source || undefined,
        tags: data.tags
          ? data.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        notes: data.notes || undefined,
      };

      if (isEditing) {
        await updateGuest.mutateAsync(payload);
        toast.success('Guest updated successfully');
      } else {
        await createGuest.mutateAsync(payload);
        toast.success('Guest created successfully');
      }

      onOpenChange(false);
    } catch (error) {
      toast.error(isEditing ? 'Failed to update guest' : 'Failed to create guest');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Guest' : 'Add New Guest'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update guest information below.'
              : 'Add a new guest to your database.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+357 99 123456" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Language</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="de">German</SelectItem>
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
                      <Input placeholder="Instagram, Website, etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="dietaryNeeds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dietary Needs</FormLabel>
                  <FormControl>
                    <Input placeholder="Vegan, gluten-free, etc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <FormControl>
                    <Input placeholder="VIP, returning, etc. (comma-separated)" {...field} />
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
                    <Textarea
                      placeholder="Additional notes about this guest..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createGuest.isPending || updateGuest.isPending}
              >
                {createGuest.isPending || updateGuest.isPending
                  ? 'Saving...'
                  : isEditing
                    ? 'Update Guest'
                    : 'Create Guest'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
