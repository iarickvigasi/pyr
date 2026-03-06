'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGuests } from '@/lib/hooks/use-guests';
import { useEvents } from '@/lib/hooks/use-events';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { EVENT_TYPES } from '@pyr/shared';
import type {
  ConversationWithMessages,
  ConversationEventAnalysis,
  ConversationEventApplyPayload,
} from '@/lib/hooks/use-conversations';
import { toast } from 'sonner';

interface InboxEventWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: ConversationWithMessages | undefined;
  analysis: ConversationEventAnalysis | null;
  isSubmitting?: boolean;
  onSubmit: (payload: ConversationEventApplyPayload) => Promise<void>;
}

type Operation = 'create_or_link' | 'cancel' | 'move';
type GuestMode = 'linked' | 'existing' | 'create';
type EventMode = 'existing' | 'create';

export function InboxEventWizardDialog({
  open,
  onOpenChange,
  conversation,
  analysis,
  isSubmitting,
  onSubmit,
}: InboxEventWizardDialogProps) {
  const defaultOperation = (analysis?.intent ?? 'create_or_link') as Operation;
  const [operation, setOperation] = useState<Operation>('create_or_link');

  const [externalBookingId, setExternalBookingId] = useState('');
  const [externalProductCode, setExternalProductCode] = useState('');
  const [attendeeCount, setAttendeeCount] = useState('1');

  const [guestMode, setGuestMode] = useState<GuestMode>('create');
  const [existingGuestId, setExistingGuestId] = useState('');
  const [guestSearch, setGuestSearch] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestLanguage, setGuestLanguage] = useState<'en' | 'de'>('en');
  const [applyGuestName, setApplyGuestName] = useState(false);
  const [applyGuestEmail, setApplyGuestEmail] = useState(false);
  const [applyGuestPhone, setApplyGuestPhone] = useState(false);

  const [eventMode, setEventMode] = useState<EventMode>('existing');
  const [existingEventId, setExistingEventId] = useState('');
  const [eventType, setEventType] = useState<'puppy_yoga' | 'beach_walk' | 'coffee_cake_cuddles' | 'retreat'>('beach_walk');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('09:00');
  const [eventCapacity, setEventCapacity] = useState('8');
  const [eventLocation, setEventLocation] = useState('');
  const [eventDescription, setEventDescription] = useState('');

  const debouncedGuestSearch = useDebounce(guestSearch, 300);
  const guestsQuery = useGuests({
    search: guestMode === 'existing' ? (debouncedGuestSearch || undefined) : undefined,
    limit: 10,
  });
  const eventsQuery = useEvents({ limit: 50 });

  const latestInbound = useMemo(() => {
    if (!conversation) return null;
    return [...conversation.messages].reverse().find((message) => message.direction === 'in') ?? null;
  }, [conversation]);

  useEffect(() => {
    if (!open) return;

    const candidate = analysis?.candidate;
    const fieldDiffs = analysis?.resolution?.guestFieldDiffs;
    setOperation(defaultOperation);
    setExternalBookingId(candidate?.externalBookingId ?? '');
    setExternalProductCode(candidate?.externalProductCode ?? '');
    setAttendeeCount(String(candidate?.attendeeCount ?? 1));

    setGuestMode(conversation?.guest ? 'linked' : 'create');
    setExistingGuestId('');
    setGuestSearch('');
    setGuestName(candidate?.guest.name ?? latestInbound?.fromName ?? '');
    setGuestEmail(candidate?.guest.email ?? latestInbound?.fromAddress ?? '');
    setGuestPhone(candidate?.guest.phone ?? '');
    setGuestLanguage(conversation?.guest?.language === 'de' ? 'de' : 'en');
    setApplyGuestName(!!fieldDiffs && !!fieldDiffs.name.proposed && fieldDiffs.name.current !== fieldDiffs.name.proposed);
    setApplyGuestEmail(!!fieldDiffs && !!fieldDiffs.email.proposed && fieldDiffs.email.current !== fieldDiffs.email.proposed);
    setApplyGuestPhone(!!fieldDiffs && !!fieldDiffs.phone.proposed && fieldDiffs.phone.current !== fieldDiffs.phone.proposed);

    setEventMode(analysis?.resolution?.matchedEventId ? 'existing' : 'create');
    setExistingEventId(analysis?.resolution?.matchedEventId ?? '');
    setEventType(candidate?.eventType ?? 'beach_walk');
    setEventTitle(candidate?.eventTitle ?? 'Viator Event');
    setEventDate(candidate?.eventDate ?? '');
    setEventTime(candidate?.eventTime ?? '09:00');
    setEventCapacity('8');
    setEventLocation(candidate?.location ?? '');
    setEventDescription('');
  }, [open, analysis, conversation, latestInbound, defaultOperation]);

  const buildEventPayload = (): { mode: 'existing'; eventId: string } | {
    mode: 'create';
    type: 'puppy_yoga' | 'beach_walk' | 'coffee_cake_cuddles' | 'retreat';
    title: string;
    date: string;
    time: string;
    capacity: number;
    location?: string | null;
    description?: string | null;
  } => {
    if (eventMode === 'existing') {
      return {
        mode: 'existing',
        eventId: existingEventId,
      };
    }

    return {
      mode: 'create',
      type: eventType,
      title: eventTitle,
      date: eventDate,
      time: eventTime,
      capacity: Number(eventCapacity),
      location: eventLocation || null,
      description: eventDescription || null,
    };
  };

  const handleSubmit = async (): Promise<void> => {
    if (!externalBookingId.trim()) {
      toast.error('External booking reference is required');
      return;
    }

    if (operation === 'cancel') {
      await onSubmit({
        operation: 'cancel',
        externalBookingId: externalBookingId.trim(),
      });
      return;
    }

    if (eventMode === 'existing' && !existingEventId) {
      toast.error('Select an existing event or switch to create mode');
      return;
    }
    if (eventMode === 'create') {
      if (!eventTitle.trim() || !eventDate || !eventTime) {
        toast.error('Event title, date, and time are required');
        return;
      }
      if (!eventCapacity || Number.isNaN(Number(eventCapacity)) || Number(eventCapacity) < 1) {
        toast.error('Event capacity must be at least 1');
        return;
      }
    }

    if (operation === 'move') {
      await onSubmit({
        operation: 'move',
        externalBookingId: externalBookingId.trim(),
        targetEvent: buildEventPayload(),
      });
      return;
    }

    if (guestMode === 'existing' && !existingGuestId) {
      toast.error('Select an existing guest');
      return;
    }
    if (guestMode === 'create' && !guestName.trim()) {
      toast.error('Guest name is required in create mode');
      return;
    }

    await onSubmit({
      operation: 'create_or_link',
      guest: {
        mode: guestMode,
        guestId: guestMode === 'existing' ? existingGuestId : undefined,
        name: guestMode === 'create' ? guestName : guestName || undefined,
        email: guestMode === 'create' ? guestEmail || undefined : guestEmail || undefined,
        phone: guestMode === 'create' ? guestPhone || undefined : guestPhone || undefined,
        language: guestMode === 'create' ? guestLanguage : undefined,
        applyUpdates: {
          name: applyGuestName,
          email: applyGuestEmail,
          phone: applyGuestPhone,
        },
      },
      event: buildEventPayload(),
      registration: {
        externalBookingId: externalBookingId.trim(),
        externalProductCode: externalProductCode.trim() || null,
        attendeeCount: Number(attendeeCount) >= 1 ? Number(attendeeCount) : 1,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Viator Event Wizard</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-2">
            <Label>Operation</Label>
            <Select value={operation} onValueChange={(value) => setOperation(value as Operation)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="create_or_link">Create / Link registration</SelectItem>
                <SelectItem value="cancel">Cancel registration</SelectItem>
                <SelectItem value="move">Move registration</SelectItem>
              </SelectContent>
            </Select>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <Label>External booking reference</Label>
              <Input value={externalBookingId} onChange={(event) => setExternalBookingId(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Attendees</Label>
              <Input type="number" min={1} value={attendeeCount} onChange={(event) => setAttendeeCount(event.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>External product code</Label>
              <Input value={externalProductCode} onChange={(event) => setExternalProductCode(event.target.value)} />
            </div>
          </section>

          {operation === 'create_or_link' && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Guest</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Guest mode</Label>
                  <Select value={guestMode} onValueChange={(value) => setGuestMode(value as GuestMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {conversation?.guest && (
                        <SelectItem value="linked">Use linked guest ({conversation.guest.name})</SelectItem>
                      )}
                      <SelectItem value="existing">Link existing guest</SelectItem>
                      <SelectItem value="create">Create guest</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {guestMode === 'existing' && (
                  <div className="space-y-2">
                    <Label>Search guest</Label>
                    <Input value={guestSearch} onChange={(event) => setGuestSearch(event.target.value)} placeholder="Search by name/email..." />
                  </div>
                )}
              </div>

              {guestMode === 'existing' && (
                <div className="space-y-2">
                  <Label>Select guest</Label>
                  <Select value={existingGuestId} onValueChange={setExistingGuestId}>
                    <SelectTrigger>
                      <SelectValue placeholder={guestsQuery.isLoading ? 'Loading...' : 'Select guest'} />
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

              {guestMode !== 'linked' && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={guestName} onChange={(event) => setGuestName(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} />
                  </div>
                  {guestMode === 'create' && (
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
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Apply guest field updates</Label>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="apply-guest-name"
                      checked={applyGuestName}
                      onCheckedChange={(checked) => setApplyGuestName(checked === true)}
                    />
                    <Label htmlFor="apply-guest-name">Name</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="apply-guest-email"
                      checked={applyGuestEmail}
                      onCheckedChange={(checked) => setApplyGuestEmail(checked === true)}
                    />
                    <Label htmlFor="apply-guest-email">Email</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="apply-guest-phone"
                      checked={applyGuestPhone}
                      onCheckedChange={(checked) => setApplyGuestPhone(checked === true)}
                    />
                    <Label htmlFor="apply-guest-phone">Phone</Label>
                  </div>
                </div>
              </div>
            </section>
          )}

          {operation !== 'cancel' && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{operation === 'move' ? 'Target event' : 'Event'}</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Event mode</Label>
                  <Select value={eventMode} onValueChange={(value) => setEventMode(value as EventMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="existing">Use existing event</SelectItem>
                      <SelectItem value="create">Create new event</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {eventMode === 'existing' ? (
                <div className="space-y-2">
                  <Label>Select event</Label>
                  <Select value={existingEventId} onValueChange={setExistingEventId}>
                    <SelectTrigger>
                      <SelectValue placeholder={eventsQuery.isLoading ? 'Loading...' : 'Select event'} />
                    </SelectTrigger>
                    <SelectContent>
                      {eventsQuery.data?.data.map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          {event.title} ({event.date.split('T')[0]} {event.time})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={eventType} onValueChange={(value) => setEventType(value as typeof eventType)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EVENT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Capacity</Label>
                      <Input type="number" min={1} value={eventCapacity} onChange={(event) => setEventCapacity(event.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Time</Label>
                      <Input type="time" value={eventTime} onChange={(event) => setEventTime(event.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Location</Label>
                    <Input value={eventLocation} onChange={(event) => setEventLocation(event.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea rows={3} value={eventDescription} onChange={(event) => setEventDescription(event.target.value)} />
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Applying...' : 'Apply'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
