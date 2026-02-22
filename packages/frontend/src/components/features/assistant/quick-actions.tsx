"use client";

import {
  CalendarDays,
  TrendingUp,
  HelpCircle,
  UserCheck,
  BedDouble,
  Mail,
} from 'lucide-react';

interface QuickActionsProps {
  onAction: (text: string) => void;
}

const quickActions = [
  {
    label: "What's today's schedule?",
    icon: CalendarDays,
  },
  {
    label: 'Revenue this month',
    icon: TrendingUp,
  },
  {
    label: 'Pending inquiries',
    icon: HelpCircle,
  },
  {
    label: 'Upcoming check-ins',
    icon: UserCheck,
  },
  {
    label: 'Room availability this week',
    icon: BedDouble,
  },
  {
    label: 'Recent guest messages',
    icon: Mail,
  },
];

export function QuickActions({ onAction }: QuickActionsProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Hey Ines!</h2>
        <p className="mt-2 text-muted-foreground">
          Ask me anything about your business, or try one of these:
        </p>
      </div>
      <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              onClick={() => onAction(action.label)}
              className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
