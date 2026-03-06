import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventDetail } from '../event-detail';

const mockCancelRegistration = vi.fn();
const mockRegisterGuest = vi.fn();
const mockDeleteEvent = vi.fn();

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: React.ReactNode }) =>
    createElement('a', { href, ...props }, children),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/hooks/use-debounce', () => ({
  useDebounce: (value: string) => value,
}));

vi.mock('@/lib/hooks/use-guests', () => ({
  useGuests: () => ({
    data: { data: [] },
  }),
}));

vi.mock('@/lib/hooks/use-events', () => ({
  useEvent: () => ({
    data: {
      data: {
        id: 'event-1',
        type: 'coffee_cake_cuddles',
        title: 'Coffee & Cuddles',
        date: '2026-03-07',
        time: '10:00',
        capacity: 6,
        location: 'Garden Lounge',
        description: null,
        createdAt: '2026-03-06T00:00:00.000Z',
        _count: { eventBookings: 2 },
      },
    },
    isLoading: false,
  }),
  useEventRegistrations: () => ({
    data: {
      data: [
        {
          id: 'reg-1',
          guestId: 'guest-1',
          status: 'confirmed',
          attendeeCount: 1,
          createdAt: '2026-03-06T00:00:00.000Z',
          guest: { id: 'guest-1', name: 'Anika', email: 'anika@example.com' },
        },
      ],
    },
  }),
  useRegisterGuest: () => ({
    mutateAsync: mockRegisterGuest,
    isPending: false,
  }),
  useDeleteEvent: () => ({
    mutateAsync: mockDeleteEvent,
    isPending: false,
  }),
  useCancelEventRegistration: () => ({
    mutateAsync: mockCancelRegistration,
    isPending: false,
  }),
}));

describe('EventDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCancelRegistration.mockResolvedValue(undefined);
    mockRegisterGuest.mockResolvedValue(undefined);
    mockDeleteEvent.mockResolvedValue(undefined);
  });

  it('confirms and removes a registration from the event', async () => {
    render(createElement(EventDetail, { id: 'event-1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(screen.getByText('Remove registration?')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove guest' }));

    await waitFor(() => {
      expect(mockCancelRegistration).toHaveBeenCalledWith({
        eventId: 'event-1',
        registrationId: 'reg-1',
      });
    });
  });
});
