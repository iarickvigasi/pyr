"use client";

import {
  HelpCircle,
  CheckCircle2,
  UserCheck,
  Euro,
  Users,
  CalendarDays,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/format';

interface Stats {
  pendingInquiries: number;
  confirmedBookings: number;
  checkedInGuests: number;
  revenueThisMonth: number;
  totalGuests: number;
  upcomingEvents: number;
}

const kpiConfig = [
  { key: 'pendingInquiries', label: 'Pending Inquiries', icon: HelpCircle, format: 'number' },
  { key: 'confirmedBookings', label: 'Confirmed', icon: CheckCircle2, format: 'number' },
  { key: 'checkedInGuests', label: 'Checked In', icon: UserCheck, format: 'number' },
  { key: 'revenueThisMonth', label: 'Revenue (Month)', icon: Euro, format: 'currency' },
  { key: 'totalGuests', label: 'Total Guests', icon: Users, format: 'number' },
  { key: 'upcomingEvents', label: 'Upcoming Events', icon: CalendarDays, format: 'number' },
] as const;

export function KpiCards({ stats, isLoading }: { stats?: Stats; isLoading: boolean }) {
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {kpiConfig.map((kpi) => {
        const Icon = kpi.icon;
        const value = stats?.[kpi.key as keyof Stats];
        return (
          <Card key={kpi.key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <div className="text-2xl font-bold">
                  {kpi.format === 'currency'
                    ? formatCurrency(value ?? 0)
                    : (value ?? 0)}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
