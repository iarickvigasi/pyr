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
import { useRoomTypes, useRooms, useCreateRoomType, useUpdateRoomType, useCreateRoom } from '@/lib/hooks/use-rooms';
import { formatCurrency } from '@/lib/format';
import { toast } from 'sonner';

const roomTypeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  basePrice: z.coerce.number().int().min(0),
  maxOccupancy: z.coerce.number().int().min(1),
});

const roomSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  roomTypeId: z.string().min(1),
});

type RoomTypeForm = z.infer<typeof roomTypeSchema>;

export function RoomsTab() {
  const typesQuery = useRoomTypes();
  const roomsQuery = useRooms();
  const createRoomType = useCreateRoomType();
  const updateRoomType = useUpdateRoomType();
  const createRoom = useCreateRoom();

  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [editType, setEditType] = useState<{ id: string; name: string; description: string | null; basePrice: number; maxOccupancy: number } | null>(null);
  const [showRoomDialog, setShowRoomDialog] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState('');

  const typeForm = useForm<RoomTypeForm>({
    resolver: zodResolver(roomTypeSchema),
    defaultValues: { name: '', description: '', basePrice: 0, maxOccupancy: 2 },
  });

  const roomForm = useForm<z.infer<typeof roomSchema>>({
    resolver: zodResolver(roomSchema),
    defaultValues: { name: '', roomTypeId: '' },
  });

  const openEditType = (t: typeof editType) => {
    setEditType(t);
    if (t) {
      typeForm.reset({
        name: t.name,
        description: t.description ?? '',
        basePrice: t.basePrice,
        maxOccupancy: t.maxOccupancy,
      });
    } else {
      typeForm.reset({ name: '', description: '', basePrice: 0, maxOccupancy: 2 });
    }
    setShowTypeDialog(true);
  };

  const onTypeSubmit = async (data: RoomTypeForm) => {
    try {
      if (editType) {
        await updateRoomType.mutateAsync({ id: editType.id, ...data });
        toast.success('Room type updated');
      } else {
        await createRoomType.mutateAsync(data);
        toast.success('Room type created');
      }
      setShowTypeDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const onRoomSubmit = async (data: z.infer<typeof roomSchema>) => {
    try {
      await createRoom.mutateAsync(data);
      toast.success('Room created');
      setShowRoomDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create room');
    }
  };

  if (typesQuery.isLoading) return <Skeleton className="h-48 w-full" />;

  const types = typesQuery.data?.data ?? [];
  const rooms = roomsQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Room Types</h3>
        <Button size="sm" onClick={() => openEditType(null)}>
          <Plus className="mr-1 h-3 w-3" />
          Add Type
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Base Price</TableHead>
            <TableHead>Max Occupancy</TableHead>
            <TableHead>Rooms</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {types.map((t) => {
            const typeRooms = rooms.filter((r) => r.roomTypeId === t.id);
            return (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>{formatCurrency(t.basePrice)}</TableCell>
                <TableCell>{t.maxOccupancy}</TableCell>
                <TableCell>
                  {typeRooms.length > 0
                    ? typeRooms.map((r) => r.name).join(', ')
                    : '-'}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEditType(t)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setSelectedTypeId(t.id);
                        roomForm.reset({ name: '', roomTypeId: t.id });
                        setShowRoomDialog(true);
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Room Type Dialog */}
      <Dialog open={showTypeDialog} onOpenChange={setShowTypeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editType ? 'Edit Room Type' : 'New Room Type'}</DialogTitle>
          </DialogHeader>
          <Form {...typeForm}>
            <form onSubmit={typeForm.handleSubmit(onTypeSubmit)} className="space-y-4">
              <FormField
                control={typeForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={typeForm.control}
                name="basePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base Price (cents)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                    </FormControl>
                    {field.value > 0 && (
                      <p className="text-xs text-muted-foreground">{formatCurrency(field.value)}</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={typeForm.control}
                name="maxOccupancy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Occupancy</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowTypeDialog(false)}>Cancel</Button>
                <Button type="submit" disabled={createRoomType.isPending || updateRoomType.isPending}>
                  {editType ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Room Dialog */}
      <Dialog open={showRoomDialog} onOpenChange={setShowRoomDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Room</DialogTitle>
          </DialogHeader>
          <Form {...roomForm}>
            <form onSubmit={roomForm.handleSubmit(onRoomSubmit)} className="space-y-4">
              <FormField
                control={roomForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room Name</FormLabel>
                    <FormControl><Input placeholder="e.g., Room A" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowRoomDialog(false)}>Cancel</Button>
                <Button type="submit" disabled={createRoom.isPending}>Create</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
