'use client';

import { useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useGuests, useMergeGuests, type Guest } from '@/lib/hooks/use-guests';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { ApiError } from '@/lib/api';
import { toast } from 'sonner';

interface GuestMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  primaryGuest: Guest;
}

type Step = 'search' | 'confirm';

export function GuestMergeDialog({ open, onOpenChange, primaryGuest }: GuestMergeDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Guest | null>(null);
  const [step, setStep] = useState<Step>('search');

  const debouncedSearch = useDebounce(searchQuery, 300);
  const mergeGuests = useMergeGuests();

  const { data, isLoading } = useGuests(
    debouncedSearch ? { search: debouncedSearch, limit: 10 } : undefined
  );

  const searchResults = (data?.data ?? []).filter((g) => g.id !== primaryGuest.id);

  const handleSelect = (guest: Guest) => {
    setSelected(guest);
    setStep('confirm');
  };

  const handleBack = () => {
    setStep('search');
    setSelected(null);
  };

  const handleMerge = async () => {
    if (!selected) return;
    try {
      await mergeGuests.mutateAsync({ primaryId: primaryGuest.id, secondaryId: selected.id });
      toast.success(`${selected.name} has been merged into ${primaryGuest.name}`);
      onOpenChange(false);
      // Reset state
      setSearchQuery('');
      setSelected(null);
      setStep('search');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Merge failed');
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSearchQuery('');
      setSelected(null);
      setStep('search');
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        {step === 'search' ? (
          <>
            <DialogHeader>
              <DialogTitle>Merge Duplicate Guest</DialogTitle>
              <DialogDescription>
                Find the duplicate to merge into <strong>{primaryGuest.name}</strong>. The
                duplicate will be deleted and all their data moved to this profile.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="min-h-[200px] space-y-2">
                {isLoading ? (
                  <>
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </>
                ) : !debouncedSearch ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    Type a name or email to search for duplicates
                  </p>
                ) : searchResults.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    No other guests found matching your search
                  </p>
                ) : (
                  searchResults.map((guest) => (
                    <button
                      key={guest.id}
                      className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 text-left transition-colors"
                      onClick={() => handleSelect(guest)}
                    >
                      <div>
                        <p className="font-medium text-sm">{guest.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {guest.email ?? 'No email'}
                          {guest.phone ? ` · ${guest.phone}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {guest.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirm Merge</DialogTitle>
              <DialogDescription>
                Review the guests below. The duplicate will be permanently deleted.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Comparison table */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 border rounded-lg bg-muted/30">
                  <p className="text-xs font-semibold text-green-600 mb-2">KEEP (Primary)</p>
                  <p className="font-medium">{primaryGuest.name}</p>
                  <p className="text-sm text-muted-foreground">{primaryGuest.email ?? 'No email'}</p>
                  {primaryGuest.phone && (
                    <p className="text-sm text-muted-foreground">{primaryGuest.phone}</p>
                  )}
                  {primaryGuest.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {primaryGuest.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3 border rounded-lg border-destructive/30 bg-destructive/5">
                  <p className="text-xs font-semibold text-destructive mb-2">
                    MERGE &amp; DELETE
                  </p>
                  <p className="font-medium">{selected?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {selected?.email ?? 'No email'}
                  </p>
                  {selected?.phone && (
                    <p className="text-sm text-muted-foreground">{selected.phone}</p>
                  )}
                  {(selected?.tags ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {selected?.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                <strong>{selected?.name}</strong> will be permanently deleted. All their bookings,
                events, and conversations will be moved to{' '}
                <strong>{primaryGuest.name}</strong>. Tags will be merged (union).
              </p>

              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={handleBack}>
                  Back
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleMerge}
                  disabled={mergeGuests.isPending}
                >
                  {mergeGuests.isPending ? 'Merging...' : 'Confirm Merge'}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
