import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { GuestsPage } from '../guests-page';
import { api } from '@/lib/api';

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

const mockGuest = {
  id: 'guest-1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: null,
  language: 'en',
  dietaryNeeds: null,
  source: 'website',
  tags: ['vip'],
  notes: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    createElement(QueryClientProvider, { client: queryClient }, ui)
  );
}

describe('GuestsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeletons while fetching', async () => {
    // Never resolve so we stay in loading state
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));

    renderWithProviders(createElement(GuestsPage));

    // Header should be visible immediately
    expect(screen.getByText('Guests')).toBeDefined();
    expect(screen.getByText('Add Guest')).toBeDefined();
  });

  it('renders guest table when data is available', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [mockGuest],
      nextCursor: null,
      hasMore: false,
    });

    renderWithProviders(createElement(GuestsPage));

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeDefined();
    });

    expect(screen.getByText('jane@example.com')).toBeDefined();
  });

  it('renders empty state when no guests', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [],
      nextCursor: null,
      hasMore: false,
    });

    renderWithProviders(createElement(GuestsPage));

    await waitFor(() => {
      expect(screen.getByText('No guests yet.')).toBeDefined();
    });

    expect(screen.getByText('Add Your First Guest')).toBeDefined();
  });

  it('opens create dialog on "Add Guest" click', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [],
      nextCursor: null,
      hasMore: false,
    });

    renderWithProviders(createElement(GuestsPage));

    const addButton = screen.getByRole('button', { name: /add guest/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('Add New Guest')).toBeDefined();
    });
  });

  it('shows Load More button when hasMore is true', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [mockGuest],
      nextCursor: 'cursor123',
      hasMore: true,
    });

    renderWithProviders(createElement(GuestsPage));

    await waitFor(() => {
      expect(screen.getByText('Load More')).toBeDefined();
    });
  });

  it('does not show Load More when hasMore is false', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [mockGuest],
      nextCursor: null,
      hasMore: false,
    });

    renderWithProviders(createElement(GuestsPage));

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeDefined();
    });

    expect(screen.queryByText('Load More')).toBeNull();
  });
});
