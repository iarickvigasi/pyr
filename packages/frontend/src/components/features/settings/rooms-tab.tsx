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
import { Plus, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useRoomTypes,
  useRooms,
  useCreateRoomType,
  useUpdateRoomType,
  useDeleteRoomType,
  useCreateRoom,
  useDeleteRoom,
  useRoomMappings,
  useMotopressAccommodations,
  useCreateRoomMapping,
  useUpdateRoomMapping,
  useDeleteRoomMapping,
  useImportMotopressRooms,
  type RoomExternalMapping,
} from '@/lib/hooks/use-rooms';
import { formatCurrency } from '@/lib/format';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

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

const roomMappingSchema = z.object({
  roomId: z.string().min(1, 'Room is required'),
  externalAccommodationId: z.string().min(1, 'MotoPress accommodation is required'),
  externalAccommodationTypeId: z.string().optional(),
  defaultAdults: z.coerce.number().int().min(1),
  defaultChildren: z.coerce.number().int().min(0),
});

type RoomTypeForm = z.infer<typeof roomTypeSchema>;
type RoomMappingForm = z.infer<typeof roomMappingSchema>;

export function RoomsTab() {
  const typesQuery = useRoomTypes();
  const roomsQuery = useRooms();
  const roomMappingsQuery = useRoomMappings('motopress');
  const accommodationsQuery = useMotopressAccommodations();
  const createRoomType = useCreateRoomType();
  const updateRoomType = useUpdateRoomType();
  const deleteRoomType = useDeleteRoomType();
  const createRoom = useCreateRoom();
  const deleteRoom = useDeleteRoom();
  const createRoomMapping = useCreateRoomMapping();
  const updateRoomMapping = useUpdateRoomMapping();
  const deleteRoomMapping = useDeleteRoomMapping();
  const importMotopressRooms = useImportMotopressRooms();
  const { confirmDialog, confirm } = useConfirmDialog();

  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [editType, setEditType] = useState<{ id: string; name: string; description: string | null; basePrice: number; maxOccupancy: number } | null>(null);
  const [showRoomDialog, setShowRoomDialog] = useState(false);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [editMapping, setEditMapping] = useState<RoomExternalMapping | null>(null);

  const typeForm = useForm<RoomTypeForm>({
    resolver: zodResolver(roomTypeSchema),
    defaultValues: { name: '', description: '', basePrice: 0, maxOccupancy: 2 },
  });

  const roomForm = useForm<z.infer<typeof roomSchema>>({
    resolver: zodResolver(roomSchema),
    defaultValues: { name: '', roomTypeId: '' },
  });

  const mappingForm = useForm<RoomMappingForm>({
    resolver: zodResolver(roomMappingSchema),
    defaultValues: {
      roomId: '',
      externalAccommodationId: '',
      externalAccommodationTypeId: '',
      defaultAdults: 1,
      defaultChildren: 0,
    },
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

  const openEditMapping = (mapping: RoomExternalMapping | null) => {
    setEditMapping(mapping);
    mappingForm.reset({
      roomId: mapping?.roomId ?? '',
      externalAccommodationId: mapping?.externalAccommodationId ?? '',
      externalAccommodationTypeId: mapping?.externalAccommodationTypeId ?? '',
      defaultAdults: mapping?.defaultAdults ?? 1,
      defaultChildren: mapping?.defaultChildren ?? 0,
    });
    setShowMappingDialog(true);
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

  const onMappingSubmit = async (data: RoomMappingForm) => {
    try {
      const payload = {
        roomId: data.roomId,
        externalAccommodationId: data.externalAccommodationId.trim(),
        externalAccommodationTypeId: data.externalAccommodationTypeId?.trim() || null,
        defaultAdults: data.defaultAdults,
        defaultChildren: data.defaultChildren,
      };

      if (editMapping) {
        await updateRoomMapping.mutateAsync({ id: editMapping.id, ...payload });
        toast.success('Room mapping updated');
      } else {
        await createRoomMapping.mutateAsync({
          ...payload,
          provider: 'motopress',
        });
        toast.success('Room mapping created');
      }
      setShowMappingDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save mapping');
    }
  };

  const handleImportFromMotopress = async () => {
    try {
      const response = await importMotopressRooms.mutateAsync();
      const summary = response.data;
      toast.success(
        `Imported room types + rooms (types +${summary.roomTypes.created}/${summary.roomTypes.updated} updated, rooms +${summary.rooms.created}/${summary.rooms.updated} updated).`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import from MotoPress');
    }
  };

  const handleDeleteRoomType = async (id: string, name: string, roomCount: number) => {
    if (roomCount > 0) {
      toast.error('Delete or move all rooms from this type first');
      return;
    }

    const confirmed = await confirm({
      title: 'Delete room type?',
      description: `Delete "${name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!confirmed) return;

    try {
      await deleteRoomType.mutateAsync(id);
      toast.success('Room type deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete room type');
    }
  };

  const handleDeleteRoom = async (id: string, name: string) => {
    const confirmed = await confirm({
      title: 'Delete room?',
      description: `Delete "${name}"? Rooms with booking history cannot be deleted.`,
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!confirmed) return;

    try {
      await deleteRoom.mutateAsync(id);
      toast.success('Room deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete room');
    }
  };

  const handleDeleteMapping = async (id: string, roomName: string) => {
    const confirmed = await confirm({
      title: 'Delete mapping?',
      description: `Delete MotoPress mapping for "${roomName}"?`,
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!confirmed) return;

    try {
      await deleteRoomMapping.mutateAsync(id);
      toast.success('Room mapping deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete room mapping');
    }
  };

  if (typesQuery.isLoading) return <Skeleton className="h-48 w-full" />;

  const types = typesQuery.data?.data ?? [];
  const rooms = roomsQuery.data?.data ?? [];
  const mappings = roomMappingsQuery.data?.data ?? [];
  const accommodations = accommodationsQuery.data?.data ?? [];

  const accommodationLabelById = new Map(
    accommodations.map((acc) => [String(acc.id), `${acc.title} (#${acc.id})`] as const),
  );
  const mappingByRoomId = new Map(mappings.map((mapping) => [mapping.roomId, mapping] as const));

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
                        roomForm.reset({ name: '', roomTypeId: t.id });
                        setShowRoomDialog(true);
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      disabled={deleteRoomType.isPending || typeRooms.length > 0}
                      title={typeRooms.length > 0 ? 'Delete rooms first' : 'Delete room type'}
                      onClick={() => handleDeleteRoomType(t.id, t.name, typeRooms.length)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Rooms</h3>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Room</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>MotoPress Mapping</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {roomsQuery.isLoading ? (
            <TableRow>
              <TableCell colSpan={5}>
                <Skeleton className="h-8 w-full" />
              </TableCell>
            </TableRow>
          ) : rooms.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No rooms yet.
              </TableCell>
            </TableRow>
          ) : (
            rooms.map((room) => {
              const mapping = mappingByRoomId.get(room.id);
              return (
                <TableRow key={room.id}>
                  <TableCell className="font-medium">{room.name}</TableCell>
                  <TableCell>{room.roomType.name}</TableCell>
                  <TableCell className="capitalize">{room.status}</TableCell>
                  <TableCell>
                    {mapping
                      ? (accommodationLabelById.get(mapping.externalAccommodationId) ?? `#${mapping.externalAccommodationId}`)
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      disabled={deleteRoom.isPending}
                      onClick={() => handleDeleteRoom(room.id, room.name)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">MotoPress Room Mapping</h3>
          <p className="text-sm text-muted-foreground">
            Manual booking sync requires each PYR room to be mapped to one MotoPress accommodation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleImportFromMotopress}
            disabled={importMotopressRooms.isPending}
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${importMotopressRooms.isPending ? 'animate-spin' : ''}`} />
            Import from MotoPress
          </Button>
          <Button size="sm" onClick={() => openEditMapping(null)}>
            <Plus className="mr-1 h-3 w-3" />
            Add Mapping
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PYR Room</TableHead>
            <TableHead>MotoPress Accommodation</TableHead>
            <TableHead>Defaults</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {roomMappingsQuery.isLoading ? (
            <TableRow>
              <TableCell colSpan={4}>
                <Skeleton className="h-8 w-full" />
              </TableCell>
            </TableRow>
          ) : mappings.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                No mappings configured yet.
              </TableCell>
            </TableRow>
          ) : (
            mappings.map((mapping) => (
              <TableRow key={mapping.id}>
                <TableCell className="font-medium">{mapping.room.name}</TableCell>
                <TableCell>
                  {accommodationLabelById.get(mapping.externalAccommodationId)
                    ?? `#${mapping.externalAccommodationId}`}
                </TableCell>
                <TableCell>
                  {`Adults: ${mapping.defaultAdults ?? 1}, Children: ${mapping.defaultChildren ?? 0}`}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEditMapping(mapping)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      disabled={deleteRoomMapping.isPending}
                      onClick={() => handleDeleteMapping(mapping.id, mapping.room.name)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {accommodationsQuery.isError && (
        <p className="text-sm text-destructive">
          Could not load MotoPress accommodations. You can still map rooms manually by ID.
        </p>
      )}

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

      {/* MotoPress Mapping Dialog */}
      <Dialog open={showMappingDialog} onOpenChange={setShowMappingDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editMapping ? 'Edit MotoPress Mapping' : 'New MotoPress Mapping'}</DialogTitle>
          </DialogHeader>
          <Form {...mappingForm}>
            <form onSubmit={mappingForm.handleSubmit(onMappingSubmit)} className="space-y-4">
              <FormField
                control={mappingForm.control}
                name="roomId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PYR Room</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select room" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {rooms.map((room) => (
                          <SelectItem key={room.id} value={room.id}>
                            {room.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {accommodations.length > 0 ? (
                <FormField
                  control={mappingForm.control}
                  name="externalAccommodationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>MotoPress Accommodation</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          const selected = accommodations.find((acc) => String(acc.id) === value);
                          mappingForm.setValue(
                            'externalAccommodationTypeId',
                            selected?.accommodationTypeId ? String(selected.accommodationTypeId) : '',
                          );
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select accommodation" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {accommodations.map((acc) => (
                            <SelectItem key={acc.id} value={String(acc.id)}>
                              {`${acc.title} (#${acc.id})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={mappingForm.control}
                  name="externalAccommodationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>MotoPress Accommodation ID</FormLabel>
                      <FormControl><Input placeholder="e.g. 1913" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={mappingForm.control}
                name="defaultAdults"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Adults</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={mappingForm.control}
                name="defaultChildren"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Children</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowMappingDialog(false)}>Cancel</Button>
                <Button type="submit" disabled={createRoomMapping.isPending || updateRoomMapping.isPending}>
                  {editMapping ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
