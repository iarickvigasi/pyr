import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EventAnalysisCard } from '../event-analysis-card';
import type { ConversationEventAnalysis } from '@/lib/hooks/use-conversations';

function makeAnalysis(
  overrides?: Partial<ConversationEventAnalysis>,
): ConversationEventAnalysis {
  return {
    status: 'ready',
    provider: 'viator',
    reason: 'Detected Viator booking action',
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
      confidence: 0.91,
    },
    resolution: {
      matchedGuestId: null,
      matchedEventId: null,
      matchedEventBookingId: null,
      recommendedOperation: 'create_or_link',
      guestFieldDiffs: {
        name: { current: null, proposed: 'Martyn Smith' },
        email: { current: null, proposed: 'martyn@example.com' },
        phone: { current: null, proposed: null },
      },
    },
    messageId: 'msg-1',
    ...overrides,
  };
}

describe('EventAnalysisCard', () => {
  it('renders idle/pending state and triggers analyze', () => {
    const onAnalyze = vi.fn();
    const onOpenWizard = vi.fn();

    render(
      <EventAnalysisCard
        analysis={null}
        onAnalyze={onAnalyze}
        onOpenWizard={onOpenWizard}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /re-analyze/i }));
    expect(onAnalyze).toHaveBeenCalledTimes(1);
    expect(onOpenWizard).not.toHaveBeenCalled();
  });

  it('renders loading state', () => {
    render(
      <EventAnalysisCard
        analysis={null}
        isLoading
        onAnalyze={vi.fn()}
        onOpenWizard={vi.fn()}
      />,
    );

    expect(screen.getByText(/analyzing viator event details/i)).toBeInTheDocument();
  });

  it('renders ready state and opens wizard', () => {
    const onOpenWizard = vi.fn();

    render(
      <EventAnalysisCard
        analysis={makeAnalysis()}
        onAnalyze={vi.fn()}
        onOpenWizard={onOpenWizard}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /open event wizard/i }));
    expect(onOpenWizard).toHaveBeenCalledTimes(1);
  });

  it('renders insufficient_data and shows missing fields', () => {
    render(
      <EventAnalysisCard
        analysis={makeAnalysis({
          status: 'insufficient_data',
          reason: 'Need more schedule details',
          missingFields: ['eventDate', 'eventTime'],
        })}
        onAnalyze={vi.fn()}
        onOpenWizard={vi.fn()}
      />,
    );

    expect(screen.getByText(/need more schedule details/i)).toBeInTheDocument();
    expect(screen.getByText(/missing: eventDate, eventTime/i)).toBeInTheDocument();
  });

  it('renders not_applicable with re-analyze action', () => {
    const onAnalyze = vi.fn();

    render(
      <EventAnalysisCard
        analysis={makeAnalysis({
          status: 'not_applicable',
          reason: 'No actionable Viator operation in this email',
          intent: null,
        })}
        onAnalyze={onAnalyze}
        onOpenWizard={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /re-analyze/i }));
    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });

  it('renders error state with retry action', () => {
    const onAnalyze = vi.fn();

    render(
      <EventAnalysisCard
        analysis={makeAnalysis({
          status: 'error',
          reason: 'OpenClaw gateway timeout',
          intent: null,
          candidate: null,
          resolution: null,
        })}
        onAnalyze={onAnalyze}
        onOpenWizard={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });
});
