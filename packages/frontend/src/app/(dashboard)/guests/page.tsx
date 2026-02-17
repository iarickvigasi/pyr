import { Suspense } from 'react';
import { GuestsPage } from '@/components/features/guests/guests-page';
import { Skeleton } from '@/components/ui/skeleton';

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <GuestsPage />
    </Suspense>
  );
}
