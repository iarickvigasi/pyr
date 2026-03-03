import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationThread } from '../conversation-thread';
import { useGenerateDraft, useRegenerateDraft } from '@/lib/hooks/use-conversations';

vi.mock('@/lib/hooks/use-conversations', () => ({
  useGenerateDraft: vi.fn(),
  useRegenerateDraft: vi.fn(),
}));

const baseMessage = {
  id: 'msg-1',
  conversationId: 'conv-1',
  direction: 'in' as const,
  content: 'Hello, I would like to book.',
  channel: 'email',
  htmlContent: null,
  fromAddress: 'guest@example.com',
  fromName: 'Guest',
  subject: 'Question',
  sentAt: '2026-03-03T10:00:00.000Z',
  createdAt: '2026-03-03T10:00:00.000Z',
  attachments: [],
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return {
    queryClient,
    ...render(createElement(QueryClientProvider, { client: queryClient }, ui)),
  };
}

describe('ConversationThread', () => {
  const mutateGenerate = vi.fn();
  const mutateRegenerate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mutateGenerate.mockReset();
    mutateRegenerate.mockReset();

    // jsdom does not implement this; component calls it in an effect.
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      writable: true,
      value: vi.fn(),
    });

    vi.mocked(useGenerateDraft).mockReturnValue({
      mutateAsync: mutateGenerate,
    } as unknown as ReturnType<typeof useGenerateDraft>);

    vi.mocked(useRegenerateDraft).mockReturnValue({
      mutateAsync: mutateRegenerate,
    } as unknown as ReturnType<typeof useRegenerateDraft>);
  });

  it('shows queued status after generate and transitions to ready when new draft appears', async () => {
    mutateGenerate.mockResolvedValue({ jobId: 'job-123', messageId: 'msg-1' });

    const { rerender, queryClient } = renderWithProviders(
      <ConversationThread
        messages={[baseMessage]}
        guestName="Guest"
        conversationId="conv-1"
        drafts={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /generate ai draft/i }));

    await waitFor(() => {
      expect(screen.getByText('Draft generation queued')).toBeInTheDocument();
    });
    expect(screen.getByText(/job: job-123/i)).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={queryClient}>
        <ConversationThread
          messages={[baseMessage]}
          guestName="Guest"
          conversationId="conv-1"
          drafts={[
            {
              id: 'draft-new',
              messageId: 'msg-1',
              conversationId: 'conv-1',
              content: 'Thanks for your email!',
              status: 'pending',
              model: 'gpt-4',
              tokensUsed: 100,
              inputTokens: 80,
              outputTokens: 20,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              costEur: 0,
              provider: 'openai',
              durationMs: 5000,
              flags: [],
              createdAt: '2026-03-03T10:00:10.000Z',
            },
          ]}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Draft ready for review')).toBeInTheDocument();
    });
  });

  it('calls regenerate endpoint when rejected draft requests a new draft', async () => {
    mutateRegenerate.mockResolvedValue({ queued: true });

    renderWithProviders(
      <ConversationThread
        messages={[baseMessage]}
        guestName="Guest"
        conversationId="conv-1"
        drafts={[
          {
            id: 'draft-rejected',
            messageId: 'msg-1',
            conversationId: 'conv-1',
            content: 'Old rejected draft',
            status: 'rejected',
            model: 'gpt-4',
            tokensUsed: 50,
            inputTokens: 40,
            outputTokens: 10,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            costEur: 0,
            provider: 'openai',
            durationMs: 1000,
            flags: [],
            createdAt: '2026-03-03T10:00:00.000Z',
          },
        ]}
        onApproveDraft={vi.fn()}
        onRejectDraft={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /generate new draft/i }));

    await waitFor(() => {
      expect(mutateRegenerate).toHaveBeenCalledWith('draft-rejected');
    });
  });
});
