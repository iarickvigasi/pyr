'use client';

import { AlertCircle, CircleSlash, Loader2, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ConversationEventAnalysis } from '@/lib/hooks/use-conversations';

interface EventAnalysisCardProps {
  analysis: ConversationEventAnalysis | null;
  isLoading?: boolean;
  onAnalyze: () => void;
  onOpenWizard: () => void;
}

function renderSummary(analysis: ConversationEventAnalysis): string {
  const candidate = analysis.candidate;
  if (!candidate) return analysis.reason;

  const bookingRef = candidate.externalBookingId ?? 'No reference';
  const eventTitle = candidate.eventTitle ?? 'Unknown event';
  const dateTime = candidate.eventDate && candidate.eventTime
    ? `${candidate.eventDate} ${candidate.eventTime}`
    : 'Date/time missing';
  const attendees = candidate.attendeeCount ?? 1;

  return `${bookingRef} • ${eventTitle} • ${dateTime} • ${attendees} pax`;
}

export function EventAnalysisCard({
  analysis,
  isLoading,
  onAnalyze,
  onOpenWizard,
}: EventAnalysisCardProps) {
  if (isLoading) {
    return (
      <Card className="border-dashed py-2 gap-2 rounded-lg">
        <CardContent className="px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analyzing Viator event details with Ailu...
        </CardContent>
      </Card>
    );
  }

  if (!analysis || analysis.status === 'pending') {
    return (
      <Card className="border-dashed py-2 gap-2 rounded-lg">
        <CardContent className="px-3 py-1.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium">Event analysis</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {analysis?.reason ?? 'Analyze Viator thread for event action suggestions.'}
            </p>
          </div>
          <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={onAnalyze}>
            <Sparkles className="mr-1 h-3 w-3" />
            Re-analyze
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (analysis.status === 'ready') {
    return (
      <Card className="border-green-200 bg-green-50/30 py-2 gap-2 rounded-lg">
        <CardContent className="px-3 py-1.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium">Viator action ready</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {renderSummary(analysis)}
            </p>
          </div>
          <Button size="sm" className="h-7 px-2 text-xs" onClick={onOpenWizard}>
            Open event wizard
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (analysis.status === 'insufficient_data') {
    return (
      <Card className="border-amber-200 bg-amber-50/30 py-2 gap-2 rounded-lg">
        <CardContent className="px-3 py-1.5 flex items-center justify-between gap-2">
          <div className="min-w-0 text-amber-900">
            <p className="text-xs font-medium">Viator intent found</p>
            <p className="text-[11px] truncate">
              {analysis.reason}
              {analysis.missingFields.length > 0 ? ` Missing: ${analysis.missingFields.join(', ')}.` : ''}
            </p>
          </div>
          <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={onOpenWizard}>
            Open event wizard
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (analysis.status === 'not_applicable') {
    return (
      <Card className="border-muted py-2 gap-2 rounded-lg">
        <CardContent className="px-3 py-1.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium flex items-center gap-1.5">
              <CircleSlash className="h-3.5 w-3.5" />
              Not an event action
            </p>
            <p className="text-[11px] text-muted-foreground truncate">{analysis.reason}</p>
          </div>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onAnalyze}>
            Re-analyze
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-red-200 bg-red-50/30 py-2 gap-2 rounded-lg">
      <CardContent className="px-3 py-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0 text-red-900">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            Event analysis failed
          </p>
          <p className="text-[11px] truncate">{analysis.reason}</p>
        </div>
        <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={onAnalyze}>
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}
