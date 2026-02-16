import { Suspense } from 'react';
import { EventsPage } from '@/components/features/events/events-page';
import { Skeleton } from '@/components/ui/skeleton';

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <EventsPage />
    </Suspense>
  );
}
