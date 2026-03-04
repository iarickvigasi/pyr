'use client';

import { Loader2, AlertCircle, CalendarRange, CircleSlash, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ConversationBookingAnalysis } from '@/lib/hooks/use-conversations';
import { formatCurrency } from '@/lib/format';

interface BookingAnalysisCardProps {
  analysis: ConversationBookingAnalysis | null;
  isLoading?: boolean;
  onAnalyze: () => void;
  onOpenWizard: () => void;
}

function renderCandidateSummary(analysis: ConversationBookingAnalysis): string {
  const candidate = analysis.candidate;
  if (!candidate) return analysis.reason;

  const dates = candidate.checkIn && candidate.checkOut
    ? `${candidate.checkIn} to ${candidate.checkOut}`
    : 'Dates missing';
  const price = candidate.totalPrice !== null
    ? formatCurrency(candidate.totalPrice)
    : 'Price unknown';
  const guest = candidate.guest.name ?? candidate.guest.email ?? 'Unknown guest';

  return `${guest} • ${dates} • ${price}`;
}

export function BookingAnalysisCard({
  analysis,
  isLoading,
  onAnalyze,
  onOpenWizard,
}: BookingAnalysisCardProps) {
  if (isLoading) {
    return (
      <Card className="border-dashed py-2 gap-2 rounded-lg">
        <CardContent className="px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analyzing booking potential with Ailu...
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card className="border-dashed py-2 gap-2 rounded-lg">
        <CardContent className="px-3 py-1.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium">Booking analysis</p>
            <p className="text-[11px] text-muted-foreground truncate">
              Analyze this thread and prefill booking wizard fields.
            </p>
          </div>
          <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={onAnalyze}>
            <Sparkles className="mr-1 h-3 w-3" />
            Analyze for booking
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
            <p className="text-xs font-medium">Booking details extracted</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {renderCandidateSummary(analysis)}
            </p>
          </div>
          <Button size="sm" className="h-7 px-2 text-xs" onClick={onOpenWizard}>
            <CalendarRange className="mr-1 h-3 w-3" />
            Create booking
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
            <p className="text-xs font-medium">Booking intent found</p>
            <p className="text-[11px] truncate">
              {analysis.reason}
              {analysis.missingFields.length > 0
                ? ` Missing: ${analysis.missingFields.join(', ')}.`
                : ''}
            </p>
          </div>
          <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={onOpenWizard}>
            Open booking form
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
              Not a booking request
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
            Booking analysis failed
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
