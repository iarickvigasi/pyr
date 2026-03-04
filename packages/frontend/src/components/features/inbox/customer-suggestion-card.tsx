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
      <Card className="border-dashed py-2 gap-2 rounded-lg">
        <CardContent className="px-3 py-1.5 text-xs text-muted-foreground">
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
      <Card className="border-amber-200 bg-amber-50/30 py-2 gap-2 rounded-lg">
        <CardContent className="px-3 py-1.5 text-xs text-amber-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <p className="truncate">{suggestion.reason}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (suggestion.status === 'matched_existing' && suggestion.matchedGuest) {
    return (
      <Card className="border-green-200 bg-green-50/30 py-2 gap-2 rounded-lg">
        <CardContent className="px-3 py-1.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium">Existing customer found</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {suggestion.matchedGuest.name}
              {suggestion.matchedGuest.email ? ` (${suggestion.matchedGuest.email})` : ''}
            </p>
          </div>
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onLinkExisting(suggestion.matchedGuest!.id)}
            disabled={isLinking}
          >
            <Link2 className="mr-1 h-3 w-3" />
            Link
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (suggestion.status === 'needs_create' && suggestion.candidate) {
    return (
      <Card className="border-blue-200 bg-blue-50/30 py-2 gap-2 rounded-lg">
      <CardContent className="px-3 py-1.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium">No linked customer</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {suggestion.candidate.name ?? 'Unknown name'}
              {suggestion.candidate.email ? ` (${suggestion.candidate.email})` : ''}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs"
            onClick={() => onCreateGuest({
              name: suggestion.candidate?.name ?? undefined,
              email: suggestion.candidate?.email ?? undefined,
              phone: suggestion.candidate?.phone ?? undefined,
            })}
            disabled={isCreating}
          >
            <UserPlus className="mr-1 h-3 w-3" />
            Create
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
}
