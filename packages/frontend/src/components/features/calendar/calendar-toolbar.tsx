"use client";

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ViewMode } from './shared/calendar-types';
import { formatMonthLabel, formatWeekLabel } from './shared/calendar-utils';

interface CalendarToolbarProps {
  currentDate: Date;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function CalendarToolbar({
  currentDate,
  viewMode,
  onViewModeChange,
  onPrev,
  onNext,
  onToday,
}: CalendarToolbarProps) {
  const label =
    viewMode === 'month'
      ? formatMonthLabel(currentDate)
      : formatWeekLabel(currentDate);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={onPrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={onNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onToday}>
          Today
        </Button>
        <h2 className="text-lg font-semibold ml-2">{label}</h2>
      </div>
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(v) => v && onViewModeChange(v as ViewMode)}
      >
        <ToggleGroupItem value="month" aria-label="Month view">
          Month
        </ToggleGroupItem>
        <ToggleGroupItem value="week" aria-label="Week view">
          Week
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
