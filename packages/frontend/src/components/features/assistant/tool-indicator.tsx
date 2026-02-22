"use client";

import { Loader2 } from 'lucide-react';
import type { ToolCall } from '@/lib/hooks/use-assistant';

interface ToolIndicatorProps {
  toolCall: ToolCall;
  label: string;
}

export function ToolIndicator({ toolCall, label }: ToolIndicatorProps) {
  const isActive = toolCall.status === 'active';

  return (
    <div className="flex items-center gap-2 px-4 py-1">
      <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground">
        {isActive ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <div className="h-3.5 w-3.5 rounded-full bg-green-500/20 flex items-center justify-center">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          </div>
        )}
        <span>{label}</span>
      </div>
    </div>
  );
}
