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
      <Card className="border-dashed">
        <CardContent className="py-3 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing booking potential with Ailu...
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Booking analysis</p>
            <p className="text-xs text-muted-foreground">
              Analyze this thread and prefill booking wizard fields.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={onAnalyze}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Analyze for booking
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (analysis.status === 'ready') {
    return (
      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Booking details extracted</p>
            <p className="text-xs text-muted-foreground truncate">
              {renderCandidateSummary(analysis)}
            </p>
          </div>
          <Button size="sm" onClick={onOpenWizard}>
            <CalendarRange className="mr-1.5 h-3.5 w-3.5" />
            Create booking
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (analysis.status === 'insufficient_data') {
    return (
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="py-3 flex items-center justify-between gap-3">
          <div className="min-w-0 text-amber-900">
            <p className="text-sm font-medium">Booking intent found</p>
            <p className="text-xs truncate">
              {analysis.reason}
              {analysis.missingFields.length > 0
                ? ` Missing: ${analysis.missingFields.join(', ')}.`
                : ''}
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={onOpenWizard}>
            Open booking form
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (analysis.status === 'not_applicable') {
    return (
      <Card className="border-muted">
        <CardContent className="py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-2">
              <CircleSlash className="h-4 w-4" />
              Not a booking request
            </p>
            <p className="text-xs text-muted-foreground truncate">{analysis.reason}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onAnalyze}>
            Re-analyze
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-red-200 bg-red-50/30">
      <CardContent className="py-3 flex items-center justify-between gap-3">
        <div className="min-w-0 text-red-900">
          <p className="text-sm font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Booking analysis failed
          </p>
          <p className="text-xs truncate">{analysis.reason}</p>
        </div>
        <Button size="sm" variant="destructive" onClick={onAnalyze}>
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}
