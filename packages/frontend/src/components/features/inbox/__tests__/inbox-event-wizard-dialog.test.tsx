import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InboxEventWizardDialog } from '../inbox-event-wizard-dialog';
import type { ConversationEventAnalysis, ConversationWithMessages } from '@/lib/hooks/use-conversations';

vi.mock('@/lib/hooks/use-guests', () => ({
  useGuests: vi.fn(() => ({
    data: { data: [] },
    isLoading: false,
  })),
}));

vi.mock('@/lib/hooks/use-events', () => ({
  useEvents: vi.fn(() => ({
    data: {
      data: [
        {
          id: 'event-1',
          title: 'Scenic Beach Walk',
          date: '2026-03-06T00:00:00.000Z',
          time: '09:00',
        },
      ],
    },
    isLoading: false,
  })),
}));

function makeConversation(): ConversationWithMessages {
  return {
    id: 'conv-1',
    guestId: 'guest-1',
    channel: 'email',
    subject: 'Viator booking',
    status: 'open',
    classification: 'ota_other',
    isRead: false,
    messagePreview: null,
    lastMessageAt: '2026-03-04T10:00:00.000Z',
    createdAt: '2026-03-04T10:00:00.000Z',
    updatedAt: '2026-03-04T10:00:00.000Z',
    guest: {
      id: 'guest-1',
      name: 'Martyn Smith',
      email: 'martyn@example.com',
      language: 'en',
    },
    messages: [
      {
        id: 'msg-1',
        conversationId: 'conv-1',
        direction: 'in',
        content: 'Viator booking message',
        channel: 'email',
        htmlContent: null,
        fromAddress: 'booking@notifications.viator.com',
        fromName: 'Viator',
        subject: 'Booking update',
        sentAt: '2026-03-04T10:00:00.000Z',
        createdAt: '2026-03-04T10:00:00.000Z',
      },
    ],
    bookings: [],
    eventRegistrations: [],
  };
}

function makeAnalysis(
  overrides?: Partial<ConversationEventAnalysis>,
): ConversationEventAnalysis {
  return {
    status: 'ready',
    provider: 'viator',
    reason: 'Detected event action',
    classification: 'ota_other',
    intent: 'create_or_link',
    missingFields: [],
    candidate: {
      externalBookingId: 'BR-1369156715',
      externalProductCode: 'PROD-1',
      eventType: 'beach_walk',
      eventTitle: 'Scenic Beach Walk',
      eventDate: '2026-03-06',
      eventTime: '09:00',
      location: 'Pafos',
      attendeeCount: 2,
      guest: {
        name: 'Martyn Smith',
        email: 'martyn@example.com',
        phone: null,
      },
      confidence: 0.9,
    },
    resolution: {
      matchedGuestId: 'guest-1',
      matchedEventId: 'event-1',
      matchedEventBookingId: null,
      recommendedOperation: 'create_or_link',
      guestFieldDiffs: {
        name: { current: 'Martyn Smith', proposed: 'Martyn Smith' },
        email: { current: 'martyn@example.com', proposed: 'martyn@example.com' },
        phone: { current: null, proposed: null },
      },
    },
    messageId: 'msg-1',
    ...overrides,
  };
}

describe('InboxEventWizardDialog', () => {
  it('submits create_or_link payload using default prefilled values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <InboxEventWizardDialog
        open
        onOpenChange={vi.fn()}
        conversation={makeConversation()}
        analysis={makeAnalysis()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      operation: 'create_or_link',
      guest: expect.objectContaining({
        mode: 'linked',
      }),
      event: {
        mode: 'existing',
        eventId: 'event-1',
      },
      registration: {
        externalBookingId: 'BR-1369156715',
        externalProductCode: 'PROD-1',
        attendeeCount: 2,
      },
    });
  });

  it('submits cancel payload when analysis intent is cancel', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <InboxEventWizardDialog
        open
        onOpenChange={vi.fn()}
        conversation={makeConversation()}
        analysis={makeAnalysis({
          intent: 'cancel',
          candidate: {
            ...makeAnalysis().candidate!,
            externalBookingId: 'BR-CANCEL-55',
          },
        })}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      operation: 'cancel',
      externalBookingId: 'BR-CANCEL-55',
    });
  });
});
