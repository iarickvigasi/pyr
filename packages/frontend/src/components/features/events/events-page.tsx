"use client";

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EventFilters } from './event-filters';
import { EventTable } from './event-table';
import { EventFormDialog } from './event-form-dialog';
import { useEvents, useDeleteEvent } from '@/lib/hooks/use-events';
import { toast } from 'sonner';

export function EventsPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'upcoming' | 'past'>(
    (searchParams.get('tab') as 'upcoming' | 'past') ?? 'upcoming',
  );
  const [type, setType] = useState(searchParams.get('type') ?? 'all');
  const [showCreate, setShowCreate] = useState(searchParams.get('new') === '1');

  const today = new Date().toISOString().split('T')[0]!;
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]!;

  const params: Record<string, string | undefined> = {
    type: type === 'all' ? undefined : type,
    from: tab === 'upcoming' ? today : undefined,
    to: tab === 'past' ? yesterday : undefined,
    limit: '20',
  };

  const { data, isLoading } = useEvents(params);
  const deleteEvent = useDeleteEvent();

  const handleDelete = async (id: string) => {
    try {
      await deleteEvent.mutateAsync(id);
      toast.success('Event deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Event
        </Button>
      </div>

      <EventFilters
        tab={tab}
        type={type}
        onTabChange={setTab}
        onTypeChange={setType}
      />

      <EventTable
        events={data?.data ?? []}
        isLoading={isLoading}
        onDelete={handleDelete}
      />

      {data?.hasMore && (
        <div className="text-center">
          <Button variant="outline" disabled>
            Load More
          </Button>
        </div>
      )}

      <EventFormDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
