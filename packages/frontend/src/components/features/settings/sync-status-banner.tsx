"use client";

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

interface SyncStatusResponse {
  data: {
    synced: number;
    pending: number;
    failed: number;
    lastSyncAt: string | null;
  };
}

/**
 * Warning banner that appears when CalDAV calendar syncs have failed.
 * Polls /api/v1/calendar/status every 60 seconds.
 * Renders nothing when there are no failures.
 */
export function SyncStatusBanner() {
  const statusQuery = useQuery({
    queryKey: queryKeys.settings.key('caldav-status'),
    queryFn: () => api.get<SyncStatusResponse>('/api/v1/calendar/status'),
    refetchInterval: 60_000,
    retry: false,
  });

  const failed = statusQuery.data?.data?.failed ?? 0;

  if (failed === 0) return null;

  return (
    <Alert className="border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <AlertTriangle className="size-4" />
      <AlertTitle>
        {failed} calendar sync{failed === 1 ? '' : 's'} failed
      </AlertTitle>
      <AlertDescription>
        Some bookings or events could not be synced to Apple Calendar. Check the Calendar tab in Settings to re-sync.
      </AlertDescription>
    </Alert>
  );
}
