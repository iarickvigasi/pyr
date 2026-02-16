"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useSetting, useUpdateSetting } from '@/lib/hooks/use-settings';
import { toast } from 'sonner';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

type BusinessHours = Record<string, DayHours>;

const defaultHours: BusinessHours = Object.fromEntries(
  DAYS.map((d) => [d, { open: '09:00', close: '18:00', closed: false }]),
);

export function BusinessHoursTab() {
  const hoursQuery = useSetting('business_hours');
  const updateSetting = useUpdateSetting();
  const [hours, setHours] = useState<BusinessHours>(defaultHours);

  useEffect(() => {
    if (hoursQuery.data?.data?.value) {
      setHours(hoursQuery.data.data.value as BusinessHours);
    }
  }, [hoursQuery.data]);

  const updateDay = (day: string, field: keyof DayHours, value: string | boolean) => {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day]!, [field]: value },
    }));
  };

  const save = async () => {
    try {
      await updateSetting.mutateAsync({
        key: 'business_hours',
        value: hours,
      });
      toast.success('Business hours saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  if (hoursQuery.isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Business Hours</h3>
      <div className="space-y-3">
        {DAYS.map((day) => {
          const dh = hours[day] ?? defaultHours[day]!;
          return (
            <div key={day} className="flex items-center gap-4">
              <span className="w-24 text-sm font-medium capitalize">{day}</span>
              <div className="flex items-center gap-2">
                <Switch
                  checked={!dh.closed}
                  onCheckedChange={(v) => updateDay(day, 'closed', !v)}
                />
                <Label className="text-xs text-muted-foreground">
                  {dh.closed ? 'Closed' : 'Open'}
                </Label>
              </div>
              {!dh.closed && (
                <>
                  <Input
                    type="time"
                    value={dh.open}
                    onChange={(e) => updateDay(day, 'open', e.target.value)}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input
                    type="time"
                    value={dh.close}
                    onChange={(e) => updateDay(day, 'close', e.target.value)}
                    className="w-28"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
      <Button onClick={save} disabled={updateSetting.isPending}>
        Save Hours
      </Button>
    </div>
  );
}
