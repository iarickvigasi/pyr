import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BookingAnalysisCard } from '../booking-analysis-card';
import type { ConversationBookingAnalysis } from '@/lib/hooks/use-conversations';

function makeAnalysis(
  overrides?: Partial<ConversationBookingAnalysis>,
): ConversationBookingAnalysis {
  return {
    status: 'ready',
    reason: 'Detected booking details',
    classification: 'conversation',
    missingFields: [],
    candidate: {
      checkIn: '2026-06-01',
      checkOut: '2026-06-05',
      totalPrice: 64000,
      currency: 'EUR',
      source: 'email',
      notes: null,
      guest: {
        name: 'Anna',
        email: 'anna@example.com',
        phone: null,
      },
      confidence: 0.9,
    },
    ...overrides,
  };
}

describe('BookingAnalysisCard', () => {
  it('renders idle state and triggers analyze', () => {
    const onAnalyze = vi.fn();
    const onOpenWizard = vi.fn();

    render(
      <BookingAnalysisCard
        analysis={null}
        onAnalyze={onAnalyze}
        onOpenWizard={onOpenWizard}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /analyze for booking/i }));
    expect(onAnalyze).toHaveBeenCalledTimes(1);
    expect(onOpenWizard).not.toHaveBeenCalled();
  });

  it('renders loading state', () => {
    render(
      <BookingAnalysisCard
        analysis={null}
        isLoading
        onAnalyze={vi.fn()}
        onOpenWizard={vi.fn()}
      />
    );

    expect(screen.getByText(/analyzing booking potential/i)).toBeInTheDocument();
  });

  it('renders ready state and opens wizard', () => {
    const onOpenWizard = vi.fn();

    render(
      <BookingAnalysisCard
        analysis={makeAnalysis()}
        onAnalyze={vi.fn()}
        onOpenWizard={onOpenWizard}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /create booking/i }));
    expect(onOpenWizard).toHaveBeenCalledTimes(1);
  });

  it('renders insufficient_data state and shows missing fields', () => {
    render(
      <BookingAnalysisCard
        analysis={makeAnalysis({
          status: 'insufficient_data',
          reason: 'Need exact dates',
          missingFields: ['checkIn', 'checkOut'],
          candidate: null,
        })}
        onAnalyze={vi.fn()}
        onOpenWizard={vi.fn()}
      />
    );

    expect(screen.getByText(/need exact dates/i)).toBeInTheDocument();
    expect(screen.getByText(/missing: checkIn, checkOut/i)).toBeInTheDocument();
  });
});
