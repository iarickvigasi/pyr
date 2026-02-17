'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { GuestsTable } from './guests-table';
import { GuestFormDialog } from './guest-form-dialog';
import { GuestFilters } from './guest-filters';
import { useGuests, type Guest } from '@/lib/hooks/use-guests';
import { useDebounce } from '@/lib/hooks/use-debounce';

export function GuestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize filter state from URL params
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [source, setSource] = useState(searchParams.get('source') ?? '');
  const [tag, setTag] = useState(searchParams.get('tag') ?? '');
  const [language, setLanguage] = useState(searchParams.get('language') ?? '');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allGuests, setAllGuests] = useState<Guest[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editGuest, setEditGuest] = useState<Guest | undefined>(undefined);

  const debouncedSearch = useDebounce(search, 300);

  const filters = {
    search: debouncedSearch || undefined,
    source: source || undefined,
    tag: tag || undefined,
    language: language || undefined,
    cursor,
    limit: 20,
  };

  const { data, isLoading, error } = useGuests(filters);

  // Reset pagination when filters change
  useEffect(() => {
    setCursor(undefined);
    setAllGuests([]);
  }, [debouncedSearch, source, tag, language]);

  // Accumulate pages
  useEffect(() => {
    if (data?.data) {
      if (!cursor) {
        setAllGuests(data.data);
      } else {
        setAllGuests((prev) => [...prev, ...data.data]);
      }
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync filters to URL
  useEffect(() => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (source) p.set('source', source);
    if (tag) p.set('tag', tag);
    if (language) p.set('language', language);
    const qs = p.toString();
    router.replace(`/guests${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [search, source, tag, language, router]);

  const handleLoadMore = () => {
    if (data?.nextCursor) {
      setCursor(data.nextCursor);
    }
  };

  const handleClear = () => {
    setSearch('');
    setSource('');
    setTag('');
    setLanguage('');
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Guests</h1>
            <p className="text-muted-foreground">Manage your guest database</p>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <p>Error loading guests. Please try again.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isEmpty = !isLoading && allGuests.length === 0;
  const hasActiveFilters = debouncedSearch || source || tag || language;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Guests</h1>
          <p className="text-muted-foreground">Manage your guest database</p>
        </div>
        <Button onClick={() => { setEditGuest(undefined); setShowCreate(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Guest
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Guests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading && allGuests.length === 0 ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                allGuests.length
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Table */}
      <Card>
        <CardHeader>
          <GuestFilters
            search={search}
            source={source}
            tag={tag}
            language={language}
            onSearchChange={setSearch}
            onSourceChange={setSource}
            onTagChange={setTag}
            onLanguageChange={setLanguage}
            onClear={handleClear}
          />
        </CardHeader>
        <CardContent>
          {isLoading && allGuests.length === 0 ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : isEmpty ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                {hasActiveFilters
                  ? 'No guests found matching your filters.'
                  : 'No guests yet.'}
              </p>
              {!hasActiveFilters && (
                <Button onClick={() => { setEditGuest(undefined); setShowCreate(true); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Your First Guest
                </Button>
              )}
            </div>
          ) : (
            <>
              <GuestsTable
                guests={allGuests}
                onEdit={(guest) => { setEditGuest(guest); setShowCreate(true); }}
              />
              {data?.hasMore && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={handleLoadMore}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Loading...' : 'Load More'}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <GuestFormDialog
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) setEditGuest(undefined);
        }}
        guest={editGuest}
      />
    </div>
  );
}
