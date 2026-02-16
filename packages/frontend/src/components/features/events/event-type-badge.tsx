"use client";

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const typeConfig: Record<string, { label: string; className: string }> = {
  puppy_yoga: { label: 'Puppy Yoga', className: 'bg-pink-100 text-pink-800 border-pink-300' },
  beach_walk: { label: 'Beach Walk', className: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  coffee_cake_cuddles: { label: 'Coffee & Cuddles', className: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  retreat: { label: 'Retreat', className: 'bg-purple-100 text-purple-800 border-purple-300' },
};

export function EventTypeBadge({ type }: { type: string }) {
  const config = typeConfig[type] ?? { label: type, className: '' };
  return (
    <Badge variant="outline" className={cn('font-medium', config.className)}>
      {config.label}
    </Badge>
  );
}
