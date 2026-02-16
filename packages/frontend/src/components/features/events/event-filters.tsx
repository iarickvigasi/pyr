"use client";

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EVENT_TYPES } from '@pyr/shared';

interface EventFiltersProps {
  tab: 'upcoming' | 'past';
  type: string;
  onTabChange: (v: 'upcoming' | 'past') => void;
  onTypeChange: (v: string) => void;
}

const typeLabels: Record<string, string> = {
  puppy_yoga: 'Puppy Yoga',
  beach_walk: 'Beach Walk',
  coffee_cake_cuddles: 'Coffee & Cuddles',
  retreat: 'Retreat',
};

export function EventFilters({
  tab,
  type,
  onTabChange,
  onTypeChange,
}: EventFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Tabs value={tab} onValueChange={(v) => onTabChange(v as 'upcoming' | 'past')}>
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>
      </Tabs>
      <Select value={type} onValueChange={onTypeChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {EVENT_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {typeLabels[t] ?? t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
