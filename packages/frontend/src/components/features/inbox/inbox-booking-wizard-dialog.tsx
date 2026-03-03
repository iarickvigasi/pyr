'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAvailability } from '@/lib/hooks/use-bookings';
import { useGuests } from '@/lib/hooks/use-guests';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { formatCurrency } from '@/lib/format';
import type {
  ConversationWithMessages,
  ConversationBookingAnalysis,
  CreateConversationBookingPayload,
} from '@/lib/hooks/use-conversations';
import { toast } from 'sonner';

interface InboxBookingWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: ConversationWithMessages | undefined;
  analysis: ConversationBookingAnalysis | null;
  isSubmitting?: boolean;
  onSubmit: (payload: CreateConversationBookingPayload) => Promise<void>;
}

export function InboxBookingWizardDialog({
  open,
  onOpenChange,
  conversation,
  analysis,
  isSubmitting,
  onSubmit,
}: InboxBookingWizardDialogProps) {
  const latestInbound = useMemo(() => {
    if (!conversation) return null;
    return [...conversation.messages].reverse().find((message) => message.direction === 'in') ?? null;
  }, [conversation]);

  const [guestMode, setGuestMode] = useState<'linked' | 'existing' | 'create'>('create');
  const [existingGuestId, setExistingGuestId] = useState('');
  const [guestSearch, setGuestSearch] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestLanguage, setGuestLanguage] = useState<'en' | 'de'>('en');

  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [roomId, setRoomId] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [status, setStatus] = useState<'inquiry' | 'confirmed'>('inquiry');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');

  const debouncedGuestSearch = useDebounce(guestSearch, 300);
  const guestsQuery = useGuests({
    search: guestMode === 'existing' ? (debouncedGuestSearch || undefined) : undefined,
    limit: 10,
  });
  const availabilityQuery = useAvailability(checkIn, checkOut);

  useEffect(() => {
    if (!open) return;

    const candidate = analysis?.candidate;
    const candidateGuest = candidate?.guest;

    setGuestMode(conversation?.guest ? 'linked' : 'create');
    setExistingGuestId('');
    setGuestSearch('');
    setGuestName(candidateGuest?.name ?? latestInbound?.fromName ?? '');
    setGuestEmail(candidateGuest?.email ?? latestInbound?.fromAddress ?? '');
    setGuestPhone(candidateGuest?.phone ?? '');
    setGuestLanguage((conversation?.guest?.language === 'de' ? 'de' : 'en'));

    setCheckIn(candidate?.checkIn ?? '');
    setCheckOut(candidate?.checkOut ?? '');
    setRoomId('');
    setTotalPrice(candidate?.totalPrice !== null && candidate?.totalPrice !== undefined ? String(candidate.totalPrice) : '');
    setStatus('inquiry');
    setSource(candidate?.source ?? 'inbox');
    setNotes(candidate?.notes ?? '');
  }, [open, analysis, conversation, latestInbound]);

  useEffect(() => {
    if (!availabilityQuery.data?.data) return;

    const matchingRoom = availabilityQuery.data.data.find((room) => room.roomId === roomId);
    if (matchingRoom) {
      setTotalPrice(String(matchingRoom.totalPrice));
      return;
    }

    if (roomId && availabilityQuery.data.data.length > 0) {
      setRoomId('');
    }
  }, [availabilityQuery.data, roomId]);

  const handleSubmit = async (): Promise<void> => {
    if (!conversation?.id) {
      toast.error('No conversation selected');
      return;
    }
    if (!checkIn || !checkOut) {
      toast.error('Check-in and check-out are required');
      return;
    }
    if (!roomId) {
      toast.error('Please select a room');
      return;
    }
    if (!totalPrice || Number.isNaN(Number(totalPrice)) || Number(totalPrice) < 0) {
      toast.error('Total price must be a valid non-negative number (cents)');
      return;
    }
    if (guestMode === 'linked' && !conversation.guest) {
      toast.error('Conversation has no linked customer. Choose existing or create mode.');
      return;
    }
    if (guestMode === 'existing' && !existingGuestId) {
      toast.error('Select an existing customer');
      return;
    }

    const payload: CreateConversationBookingPayload = {
      guest: {
        mode: guestMode,
        ...(guestMode === 'existing' ? { guestId: existingGuestId } : {}),
        ...(guestMode === 'create'
          ? {
              name: guestName || undefined,
              email: guestEmail || undefined,
              phone: guestPhone || undefined,
              language: guestLanguage,
            }
          : {}),
      },
      booking: {
        roomId,
        checkIn,
        checkOut,
        totalPrice: Number(totalPrice),
        status,
        source: source || null,
        notes: notes || null,
      },
    };

    await onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Booking From Conversation</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Guest</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Guest mode</Label>
                <Select value={guestMode} onValueChange={(value) => setGuestMode(value as 'linked' | 'existing' | 'create')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {conversation?.guest && (
                      <SelectItem value="linked">Use linked customer ({conversation.guest.name})</SelectItem>
                    )}
                    <SelectItem value="existing">Link existing customer</SelectItem>
                    <SelectItem value="create">Create customer in wizard</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {guestMode === 'existing' && (
                <div className="space-y-2">
                  <Label>Search customer</Label>
                  <Input
                    placeholder="Search by name/email..."
                    value={guestSearch}
                    onChange={(event) => setGuestSearch(event.target.value)}
                  />
                </div>
              )}
            </div>

            {guestMode === 'existing' && (
              <div className="space-y-2">
                <Label>Select customer</Label>
                <Select value={existingGuestId} onValueChange={setExistingGuestId}>
                  <SelectTrigger>
                    <SelectValue placeholder={guestsQuery.isLoading ? 'Loading...' : 'Select existing customer'} />
                  </SelectTrigger>
                  <SelectContent>
                    {guestsQuery.data?.data.map((guest) => (
                      <SelectItem key={guest.id} value={guest.id}>
                        {guest.name}{guest.email ? ` (${guest.email})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {guestMode === 'create' && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    placeholder="Guest name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    value={guestEmail}
                    onChange={(event) => setGuestEmail(event.target.value)}
                    placeholder="guest@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={guestPhone}
                    onChange={(event) => setGuestPhone(event.target.value)}
                    placeholder="+357..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select value={guestLanguage} onValueChange={(value) => setGuestLanguage(value as 'en' | 'de')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Booking</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Check-in</Label>
                <Input type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Check-out</Label>
                <Input type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Room</Label>
              <Select value={roomId} onValueChange={(value) => {
                setRoomId(value);
                const selected = availabilityQuery.data?.data.find((room) => room.roomId === value);
                if (selected) {
                  setTotalPrice(String(selected.totalPrice));
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select available room" />
                </SelectTrigger>
                <SelectContent>
                  {availabilityQuery.data?.data.map((room) => (
                    <SelectItem key={room.roomId} value={room.roomId}>
                      {room.roomName} ({room.roomTypeName}) — {formatCurrency(room.totalPrice)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {checkIn && checkOut && availabilityQuery.data?.data.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No rooms available for selected dates.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Total price (cents)</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={totalPrice}
                  onChange={(event) => setTotalPrice(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as 'inquiry' | 'confirmed')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inquiry">Inquiry</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Source</Label>
              <Input value={source} onChange={(event) => setSource(event.target.value)} placeholder="inbox" />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Internal booking notes"
                rows={4}
              />
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create booking'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
