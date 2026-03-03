'use client';

import { UserPlus, Link2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { CustomerSuggestion } from '@/lib/hooks/use-conversations';

interface CustomerSuggestionCardProps {
  suggestion: CustomerSuggestion | undefined;
  isLoading?: boolean;
  onLinkExisting: (guestId: string) => void;
  onCreateGuest: (payload: { name?: string; email?: string; phone?: string }) => void;
  isLinking?: boolean;
  isCreating?: boolean;
}

export function CustomerSuggestionCard({
  suggestion,
  isLoading,
  onLinkExisting,
  onCreateGuest,
  isLinking,
  isCreating,
}: CustomerSuggestionCardProps) {
  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-3 text-sm text-muted-foreground">
          Checking customer match...
        </CardContent>
      </Card>
    );
  }

  if (!suggestion) {
    return null;
  }

  if (suggestion.status === 'linked' || suggestion.status === 'not_applicable') {
    return null;
  }

  if (suggestion.status === 'insufficient_data') {
    return (
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="py-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>{suggestion.reason}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (suggestion.status === 'matched_existing' && suggestion.matchedGuest) {
    return (
      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Possible existing customer found</p>
            <p className="text-xs text-muted-foreground truncate">
              {suggestion.matchedGuest.name}
              {suggestion.matchedGuest.email ? ` (${suggestion.matchedGuest.email})` : ''}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => onLinkExisting(suggestion.matchedGuest!.id)}
            disabled={isLinking}
          >
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            Link
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (suggestion.status === 'needs_create' && suggestion.candidate) {
    return (
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">No linked customer</p>
            <p className="text-xs text-muted-foreground truncate">
              {suggestion.candidate.name ?? 'Unknown name'}
              {suggestion.candidate.email ? ` (${suggestion.candidate.email})` : ''}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onCreateGuest({
              name: suggestion.candidate?.name ?? undefined,
              email: suggestion.candidate?.email ?? undefined,
              phone: suggestion.candidate?.phone ?? undefined,
            })}
            disabled={isCreating}
          >
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            Create
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
}
