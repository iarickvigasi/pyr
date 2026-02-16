"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useSetting, useUpdateSetting } from '@/lib/hooks/use-settings';
import { toast } from 'sonner';

interface NotificationPreferences {
  newBookings: boolean;
  paymentsReceived: boolean;
  overdueInvoices: boolean;
  newInquiries: boolean;
  guestArrivals: boolean;
  channels: {
    email: boolean;
    dashboard: boolean;
    assistant: boolean;
  };
}

const defaultPrefs: NotificationPreferences = {
  newBookings: true,
  paymentsReceived: true,
  overdueInvoices: true,
  newInquiries: true,
  guestArrivals: true,
  channels: { email: true, dashboard: true, assistant: true },
};

const eventLabels: Record<string, string> = {
  newBookings: 'New Bookings',
  paymentsReceived: 'Payments Received',
  overdueInvoices: 'Overdue Invoices',
  newInquiries: 'New Inquiries',
  guestArrivals: 'Guest Arrivals',
};

const channelLabels: Record<string, string> = {
  email: 'Email',
  dashboard: 'Dashboard',
  assistant: 'AI Assistant',
};

export function NotificationsTab() {
  const prefsQuery = useSetting('notification_preferences');
  const updateSetting = useUpdateSetting();
  const [prefs, setPrefs] = useState<NotificationPreferences>(defaultPrefs);

  useEffect(() => {
    if (prefsQuery.data?.data?.value) {
      setPrefs(prefsQuery.data.data.value as NotificationPreferences);
    }
  }, [prefsQuery.data]);

  const toggleEvent = (key: string) => {
    setPrefs((p) => ({ ...p, [key]: !p[key as keyof NotificationPreferences] }));
  };

  const toggleChannel = (key: string) => {
    setPrefs((p) => ({
      ...p,
      channels: { ...p.channels, [key]: !p.channels[key as keyof typeof p.channels] },
    }));
  };

  const save = async () => {
    try {
      await updateSetting.mutateAsync({
        key: 'notification_preferences',
        value: prefs,
      });
      toast.success('Notification preferences saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  if (prefsQuery.isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-3">Notification Events</h3>
        <div className="space-y-3">
          {Object.entries(eventLabels).map(([key, label]) => (
            <div key={key} className="flex items-center gap-3">
              <Checkbox
                id={key}
                checked={prefs[key as keyof NotificationPreferences] as boolean}
                onCheckedChange={() => toggleEvent(key)}
              />
              <Label htmlFor={key}>{label}</Label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-lg font-medium mb-3">Channels</h3>
        <div className="space-y-3">
          {Object.entries(channelLabels).map(([key, label]) => (
            <div key={key} className="flex items-center gap-3">
              <Checkbox
                id={`ch-${key}`}
                checked={prefs.channels[key as keyof typeof prefs.channels]}
                onCheckedChange={() => toggleChannel(key)}
              />
              <Label htmlFor={`ch-${key}`}>{label}</Label>
            </div>
          ))}
        </div>
      </div>

      <Button onClick={save} disabled={updateSetting.isPending}>
        Save Preferences
      </Button>
    </div>
  );
}
