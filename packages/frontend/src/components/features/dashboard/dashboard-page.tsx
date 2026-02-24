"use client";

import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';
import { Button } from '@/components/ui/button';
import { KpiCards } from './kpi-cards';
import { TodayActivity } from './today-activity';
import { QuickActions } from './quick-actions';

interface StatsResponse {
  data: {
    pendingInquiries: number;
    confirmedBookings: number;
    checkedInGuests: number;
    revenueThisMonth: number;
    totalGuests: number;
    upcomingEvents: number;
  };
}

interface TodayResponse {
  data: {
    checkIns: Array<{
      id: string;
      guestNames: string[];
      roomName: string;
      checkIn: string;
      checkOut: string;
    }>;
    checkOuts: Array<{
      id: string;
      guestNames: string[];
      roomName: string;
      checkIn: string;
      checkOut: string;
    }>;
    events: Array<{
      id: string;
      type: string;
      title: string;
      time: string;
      capacity: number;
      registeredCount: number;
    }>;
  };
}

export function DashboardPage() {
  const statsQuery = useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: () => api.get<StatsResponse>('/api/v1/dashboard/stats'),
    refetchInterval: 60_000,
  });

  const todayQuery = useQuery({
    queryKey: queryKeys.dashboard.today,
    queryFn: () => api.get<TodayResponse>('/api/v1/dashboard/today'),
    refetchInterval: 60_000,
  });

  const handleRefresh = () => {
    statsQuery.refetch();
    todayQuery.refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={statsQuery.isFetching || todayQuery.isFetching}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <KpiCards stats={statsQuery.data?.data} isLoading={statsQuery.isLoading} />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <TodayActivity
          data={todayQuery.data?.data}
          isLoading={todayQuery.isLoading}
        />
        <QuickActions />
      </div>
    </div>
  );
}
