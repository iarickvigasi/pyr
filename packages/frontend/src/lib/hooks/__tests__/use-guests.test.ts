import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useGuests, useMergeGuests, useCreateGuest, useUpdateGuest, useDeleteGuest } from '../use-guests';
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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockGuest = {
  id: 'guest-1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: null,
  language: 'en',
  dietaryNeeds: null,
  source: null,
  tags: [],
  notes: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('useGuests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns full paginated response including nextCursor and hasMore', async () => {
    const mockResponse = { data: [mockGuest], nextCursor: 'cursor123', hasMore: true };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useGuests({ search: 'jane' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockResponse);
    expect(result.current.data?.nextCursor).toBe('cursor123');
    expect(result.current.data?.hasMore).toBe(true);
    expect(result.current.data?.data).toHaveLength(1);
  });

  it('passes filters as query params', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [], nextCursor: null, hasMore: false });

    const { result } = renderHook(
      () => useGuests({ search: 'test', language: 'de', tag: 'vip' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith(
      '/api/v1/guests',
      expect.objectContaining({
        params: expect.objectContaining({ search: 'test', language: 'de', tag: 'vip' }),
      })
    );
  });
});

describe('useMergeGuests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls POST /api/v1/guests/merge with primaryId and secondaryId', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: mockGuest });
    vi.mocked(api.get).mockResolvedValue({ data: [], nextCursor: null, hasMore: false });

    const { result } = renderHook(() => useMergeGuests(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({ primaryId: 'guest-1', secondaryId: 'guest-2' });

    expect(api.post).toHaveBeenCalledWith('/api/v1/guests/merge', {
      primaryId: 'guest-1',
      secondaryId: 'guest-2',
    });
  });
});

describe('useCreateGuest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls POST /api/v1/guests with guest data', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: mockGuest });
    vi.mocked(api.get).mockResolvedValue({ data: [], nextCursor: null, hasMore: false });

    const { result } = renderHook(() => useCreateGuest(), {
      wrapper: createWrapper(),
    });

    const created = await result.current.mutateAsync({ name: 'Jane Doe', email: 'jane@example.com' });

    expect(api.post).toHaveBeenCalledWith('/api/v1/guests', {
      name: 'Jane Doe',
      email: 'jane@example.com',
    });
    expect(created).toEqual(mockGuest);
  });
});

describe('useUpdateGuest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls PATCH /api/v1/guests/:id with update data', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { ...mockGuest, name: 'Updated Name' } });
    vi.mocked(api.get).mockResolvedValue({ data: mockGuest });

    const { result } = renderHook(() => useUpdateGuest('guest-1'), {
      wrapper: createWrapper(),
    });

    const updated = await result.current.mutateAsync({ name: 'Updated Name' });

    expect(api.patch).toHaveBeenCalledWith('/api/v1/guests/guest-1', { name: 'Updated Name' });
    expect(updated.name).toBe('Updated Name');
  });
});

describe('useDeleteGuest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls DELETE /api/v1/guests/:id', async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined);
    vi.mocked(api.get).mockResolvedValue({ data: [], nextCursor: null, hasMore: false });

    const { result } = renderHook(() => useDeleteGuest(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync('guest-1');

    expect(api.delete).toHaveBeenCalledWith('/api/v1/guests/guest-1');
  });
});
