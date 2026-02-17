import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { GuestMergeDialog } from '../guest-merge-dialog';
import { api } from '@/lib/api';

// Mock debounce to be immediate (no 300ms delay in tests)
vi.mock('@/lib/hooks/use-debounce', () => ({
  useDebounce: <T,>(value: T) => value,
}));

// Mock api module
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const primaryGuest = {
  id: 'primary-1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: null,
  language: 'en',
  dietaryNeeds: null,
  source: null,
  tags: ['vip'],
  notes: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const duplicateGuest = {
  id: 'dup-1',
  name: 'Jane D.',
  email: 'jane.d@example.com',
  phone: null,
  language: 'en',
  dietaryNeeds: null,
  source: null,
  tags: [],
  notes: null,
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    createElement(QueryClientProvider, { client: queryClient }, ui)
  );
}

describe('GuestMergeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: [], nextCursor: null, hasMore: false });
  });

  it('shows search step by default when open', () => {
    renderWithProviders(
      createElement(GuestMergeDialog, {
        open: true,
        onOpenChange: vi.fn(),
        primaryGuest,
      })
    );

    expect(screen.getByText('Merge Duplicate Guest')).toBeDefined();
    expect(screen.getByPlaceholderText('Search by name or email...')).toBeDefined();
  });

  it('does not render when closed', () => {
    renderWithProviders(
      createElement(GuestMergeDialog, {
        open: false,
        onOpenChange: vi.fn(),
        primaryGuest,
      })
    );

    expect(screen.queryByText('Merge Duplicate Guest')).toBeNull();
  });

  it('lists search results excluding the primary guest', async () => {
    // API returns both guests but only the duplicate should appear in results
    vi.mocked(api.get).mockResolvedValue({
      data: [primaryGuest, duplicateGuest],
      nextCursor: null,
      hasMore: false,
    });

    renderWithProviders(
      createElement(GuestMergeDialog, {
        open: true,
        onOpenChange: vi.fn(),
        primaryGuest,
      })
    );

    const searchInput = screen.getByPlaceholderText('Search by name or email...');
    fireEvent.change(searchInput, { target: { value: 'jane' } });

    await waitFor(() => {
      // Duplicate should appear as a result button
      expect(screen.getByRole('button', { name: /jane d\./i })).toBeDefined();
    });

    // Primary guest should NOT appear as a result button (may appear in description)
    const resultButtons = screen.queryAllByRole('button', { name: /jane doe/i });
    expect(resultButtons).toHaveLength(0);
  });

  it('shows comparison view after selecting a guest', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [duplicateGuest],
      nextCursor: null,
      hasMore: false,
    });

    renderWithProviders(
      createElement(GuestMergeDialog, {
        open: true,
        onOpenChange: vi.fn(),
        primaryGuest,
      })
    );

    const searchInput = screen.getByPlaceholderText('Search by name or email...');
    fireEvent.change(searchInput, { target: { value: 'jane' } });

    await waitFor(() => {
      expect(screen.getByText('Jane D.')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Jane D.'));

    await waitFor(() => {
      // Title appears in h2 (may have multiple "Confirm Merge" – title + button)
      expect(screen.getAllByText('Confirm Merge').length).toBeGreaterThan(0);
      expect(screen.getByText('KEEP (Primary)')).toBeDefined();
    });
  });

  it('calls mergeGuests mutation with correct primaryId and secondaryId', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [duplicateGuest],
      nextCursor: null,
      hasMore: false,
    });
    vi.mocked(api.post).mockResolvedValue({ data: primaryGuest });

    const onOpenChange = vi.fn();

    renderWithProviders(
      createElement(GuestMergeDialog, {
        open: true,
        onOpenChange,
        primaryGuest,
      })
    );

    // Search for duplicate
    const searchInput = screen.getByPlaceholderText('Search by name or email...');
    fireEvent.change(searchInput, { target: { value: 'jane' } });

    await waitFor(() => {
      expect(screen.getByText('Jane D.')).toBeDefined();
    });

    // Select the duplicate
    fireEvent.click(screen.getByText('Jane D.'));

    await waitFor(() => {
      expect(screen.getAllByText('Confirm Merge').length).toBeGreaterThan(0);
    });

    // Click the confirm button specifically
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Merge' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/guests/merge', {
        primaryId: 'primary-1',
        secondaryId: 'dup-1',
      });
    });
  });

  it('shows back button in confirm step to return to search', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [duplicateGuest],
      nextCursor: null,
      hasMore: false,
    });

    renderWithProviders(
      createElement(GuestMergeDialog, {
        open: true,
        onOpenChange: vi.fn(),
        primaryGuest,
      })
    );

    const searchInput = screen.getByPlaceholderText('Search by name or email...');
    fireEvent.change(searchInput, { target: { value: 'jane' } });

    await waitFor(() => {
      expect(screen.getByText('Jane D.')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Jane D.'));

    await waitFor(() => {
      expect(screen.getByText('Back')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Back'));

    await waitFor(() => {
      expect(screen.getByText('Merge Duplicate Guest')).toBeDefined();
    });
  });
});
