'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface GuestFiltersProps {
  search: string;
  source: string;
  tag: string;
  language: string;
  onSearchChange: (v: string) => void;
  onSourceChange: (v: string) => void;
  onTagChange: (v: string) => void;
  onLanguageChange: (v: string) => void;
  onClear: () => void;
}

export function GuestFilters({
  search,
  source,
  tag,
  language,
  onSearchChange,
  onSourceChange,
  onTagChange,
  onLanguageChange,
  onClear,
}: GuestFiltersProps) {
  const hasActiveFilters = search || source || tag || language;

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search guests by name or email..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <Input
        placeholder="Source..."
        value={source}
        onChange={(e) => onSourceChange(e.target.value)}
        className="w-[140px]"
      />

      <Input
        placeholder="Tag..."
        value={tag}
        onChange={(e) => onTagChange(e.target.value)}
        className="w-[130px]"
      />

      <Select value={language || 'all'} onValueChange={(v) => onLanguageChange(v === 'all' ? '' : v)}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Language" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Languages</SelectItem>
          <SelectItem value="en">English</SelectItem>
          <SelectItem value="de">German</SelectItem>
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClear} className="gap-1">
          <X className="h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
}
