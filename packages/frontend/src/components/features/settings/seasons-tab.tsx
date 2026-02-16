"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil } from 'lucide-react';
import { useSeasons, useCreateSeason, useUpdateSeason } from '@/lib/hooks/use-rooms';
import { formatDate } from '@/lib/format';
import { toast } from 'sonner';

const seasonSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  priceMultiplier: z.coerce.number().min(0.01, 'Must be > 0'),
});

type SeasonForm = z.infer<typeof seasonSchema>;

export function SeasonsTab() {
  const seasonsQuery = useSeasons();
  const createSeason = useCreateSeason();
  const updateSeason = useUpdateSeason();

  const [showDialog, setShowDialog] = useState(false);
  const [editSeason, setEditSeason] = useState<{
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    priceMultiplier: number;
  } | null>(null);

  const form = useForm<SeasonForm>({
    resolver: zodResolver(seasonSchema),
    defaultValues: { name: '', startDate: '', endDate: '', priceMultiplier: 1 },
  });

  const openEdit = (s: typeof editSeason) => {
    setEditSeason(s);
    if (s) {
      form.reset({
        name: s.name,
        startDate: s.startDate.split('T')[0],
        endDate: s.endDate.split('T')[0],
        priceMultiplier: s.priceMultiplier,
      });
    } else {
      form.reset({ name: '', startDate: '', endDate: '', priceMultiplier: 1 });
    }
    setShowDialog(true);
  };

  const onSubmit = async (data: SeasonForm) => {
    try {
      if (editSeason) {
        await updateSeason.mutateAsync({ id: editSeason.id, ...data });
        toast.success('Season updated');
      } else {
        await createSeason.mutateAsync(data);
        toast.success('Season created');
      }
      setShowDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  if (seasonsQuery.isLoading) return <Skeleton className="h-48 w-full" />;

  const seasons = seasonsQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Seasons</h3>
        <Button size="sm" onClick={() => openEdit(null)}>
          <Plus className="mr-1 h-3 w-3" />
          Add Season
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Start Date</TableHead>
            <TableHead>End Date</TableHead>
            <TableHead>Multiplier</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {seasons.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell>{formatDate(s.startDate)}</TableCell>
              <TableCell>{formatDate(s.endDate)}</TableCell>
              <TableCell>{s.priceMultiplier}x</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => openEdit(s)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {seasons.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No seasons configured
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editSeason ? 'Edit Season' : 'New Season'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g., High Season" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="priceMultiplier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price Multiplier</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
                <Button type="submit" disabled={createSeason.isPending || updateSeason.isPending}>
                  {editSeason ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
