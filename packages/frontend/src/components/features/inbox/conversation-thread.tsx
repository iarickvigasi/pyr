'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock3, Loader2, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/query-client';
import { EmailMessage } from './email-message';
import { OtaBookingBadge } from './ota-booking-badge';
import { DraftCard } from './draft-card';
import { useGenerateDraft, useRegenerateDraft } from '@/lib/hooks/use-conversations';
import type { Message, LinkedBooking, AiDraft } from '@/lib/hooks/use-conversations';

interface ConversationThreadProps {
  messages: Message[];
  guestName: string;
  conversationId: string;
  bookings?: LinkedBooking[];
  classification?: string | null;
  drafts?: AiDraft[];
  onApproveDraft?: (payload: { draftId: string; content: string; originalContent: string }) => void;
  onRejectDraft?: (draftId: string) => void;
  isApprovePending?: boolean;
}

const DRAFT_WAIT_TIMEOUT_MS = 120_000;

type DraftGenerationPhase = 'submitting' | 'queued' | 'waiting' | 'ready' | 'error';

interface DraftGenerationState {
  mode: 'generate' | 'regenerate';
  phase: DraftGenerationPhase;
  startedAt: number;
  trackedMessageId: string | null;
  sourceDraftId: string | null;
  baselineDraftIds: string[];
  jobId: string | null;
  errorMessage: string | null;
}

function isGenerationInFlight(state: DraftGenerationState | null): boolean {
  if (!state) return false;
  return state.phase === 'submitting' || state.phase === 'queued' || state.phase === 'waiting';
}

function getGenerationStatusCopy(state: DraftGenerationState) {
  if (state.phase === 'submitting') {
    return {
      title: state.mode === 'generate' ? 'Starting draft generation...' : 'Starting draft regeneration...',
      description: 'Sending request to the backend.',
    };
  }
  if (state.phase === 'queued') {
    return {
      title: 'Draft generation queued',
      description: state.jobId
        ? `Job ${state.jobId} is queued and will be processed shortly.`
        : 'The job is queued and will be processed shortly.',
    };
  }
  if (state.phase === 'waiting') {
    return {
      title: 'OpenClaw is generating the draft',
      description: 'Waiting for AI output. This usually takes 10-30 seconds.',
    };
  }
  if (state.phase === 'ready') {
    return {
      title: 'Draft ready for review',
      description: 'A new draft is available below.',
    };
  }
  return {
    title: 'Draft generation failed',
    description: state.errorMessage ?? 'The request did not complete. Please retry.',
  };
}

export function ConversationThread({
  messages,
  guestName,
  conversationId,
  bookings,
  classification,
  drafts,
  onApproveDraft,
  onRejectDraft,
  isApprovePending,
}: ConversationThreadProps) {
  const queryClient = useQueryClient();
  const generateDraft = useGenerateDraft(conversationId);
  const regenerateDraft = useRegenerateDraft(conversationId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [generationState, setGenerationState] = useState<DraftGenerationState | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, drafts]);

  useEffect(() => {
    setGenerationState(null);
  }, [conversationId]);

  const latestInboundMessageId = useMemo(() => {
    let latestInbound: Message | null = null;
    for (const message of messages) {
      if (message.direction !== 'in') continue;
      if (!latestInbound) {
        latestInbound = message;
        continue;
      }
      if (new Date(message.sentAt).getTime() > new Date(latestInbound.sentAt).getTime()) {
        latestInbound = message;
      }
    }
    return latestInbound?.id ?? null;
  }, [messages]);

  const generationInFlight = isGenerationInFlight(generationState);

  useEffect(() => {
    if (!generationInFlight) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.drafts(conversationId) });
    }, 2000);

    return () => clearInterval(interval);
  }, [generationInFlight, conversationId, queryClient]);

  useEffect(() => {
    if (!generationInFlight || !generationState) return;

    const elapsed = Date.now() - generationState.startedAt;
    const remaining = Math.max(0, DRAFT_WAIT_TIMEOUT_MS - elapsed);

    const timeout = setTimeout(() => {
      setGenerationState((prev) => {
        if (!prev || !isGenerationInFlight(prev)) return prev;
        return {
          ...prev,
          phase: 'error',
          errorMessage: 'Timed out waiting for AI draft. Please try again.',
        };
      });
    }, remaining);

    return () => clearTimeout(timeout);
  }, [generationInFlight, generationState]);

  useEffect(() => {
    if (!generationState || !isGenerationInFlight(generationState)) return;
    if (!drafts || drafts.length === 0) return;

    const baselineIds = new Set(generationState.baselineDraftIds);
    const newDrafts = drafts.filter((draft) => !baselineIds.has(draft.id));

    if (newDrafts.length === 0) return;

    const matchingDraft = generationState.trackedMessageId
      ? newDrafts.find((draft) => draft.messageId === generationState.trackedMessageId)
      : newDrafts[0];

    if (!matchingDraft) return;

    if (matchingDraft.status === 'failed') {
      setGenerationState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'error',
          errorMessage: 'AI draft generation failed after retries. You can retry now.',
        };
      });
      return;
    }

    setGenerationState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        phase: 'ready',
        errorMessage: null,
      };
    });
  }, [drafts, generationState]);

  useEffect(() => {
    if (!generationState || generationState.phase !== 'queued') return;

    const timeout = setTimeout(() => {
      setGenerationState((prev) => {
        if (!prev || prev.phase !== 'queued') return prev;
        return { ...prev, phase: 'waiting' };
      });
    }, 1200);

    return () => clearTimeout(timeout);
  }, [generationState]);

  useEffect(() => {
    if (!generationState || generationState.phase !== 'ready') return;

    const timeout = setTimeout(() => {
      setGenerationState((prev) => (prev?.phase === 'ready' ? null : prev));
    }, 5000);

    return () => clearTimeout(timeout);
  }, [generationState]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-center">
        <p className="text-muted-foreground">No messages yet</p>
      </div>
    );
  }

  // Determine if we should show booking badges after the last message
  const isOtaConversation =
    classification === 'ota_notification'
    || classification === 'ota_tripaneer'
    || classification === 'ota_bookyogaretreats'
    || classification === 'ota_other';
  const linkedBookings = bookings ?? [];

  // Drafts that have a messageId (inline after their triggering message)
  const draftsByMessageId = new Map<string, AiDraft>();
  // Drafts without a messageId (legacy/fallback -- shown at the bottom)
  const orphanDrafts: AiDraft[] = [];

  if (drafts) {
    for (const draft of drafts) {
      if (draft.messageId) {
        // Backend returns drafts newest-first. Keep the first draft per message
        // so we don't overwrite a fresh pending draft with an older rejected one.
        if (!draftsByMessageId.has(draft.messageId)) {
          draftsByMessageId.set(draft.messageId, draft);
        }
      } else {
        orphanDrafts.push(draft);
      }
    }
  }

  const handleGenerate = async (): Promise<void> => {
    if (generationInFlight) return;
    if (!latestInboundMessageId) return;

    const baselineDraftIds = (drafts ?? []).map((draft) => draft.id);

    setGenerationState({
      mode: 'generate',
      phase: 'submitting',
      startedAt: Date.now(),
      trackedMessageId: latestInboundMessageId,
      sourceDraftId: null,
      baselineDraftIds,
      jobId: null,
      errorMessage: null,
    });

    try {
      const result = await generateDraft.mutateAsync();
      setGenerationState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'queued',
          trackedMessageId: result.messageId ?? prev.trackedMessageId,
          jobId: result.jobId ?? null,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start draft generation.';
      setGenerationState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'error',
          errorMessage: message,
        };
      });
    }
  };

  const handleRegenerate = async (draftId: string): Promise<void> => {
    if (generationInFlight) return;

    const sourceDraft = drafts?.find((draft) => draft.id === draftId);
    const fallbackTrackedMessageId = sourceDraft?.messageId ?? latestInboundMessageId;
    const baselineDraftIds = (drafts ?? []).map((draft) => draft.id);

    setGenerationState({
      mode: 'regenerate',
      phase: 'submitting',
      startedAt: Date.now(),
      trackedMessageId: fallbackTrackedMessageId,
      sourceDraftId: draftId,
      baselineDraftIds,
      jobId: null,
      errorMessage: null,
    });

    try {
      await regenerateDraft.mutateAsync(draftId);
      setGenerationState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'queued',
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not regenerate draft.';
      setGenerationState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          phase: 'error',
          errorMessage: message,
        };
      });
    }
  };

  const retryGeneration = (): void => {
    if (!generationState) return;
    if (generationState.mode === 'regenerate' && generationState.sourceDraftId) {
      void handleRegenerate(generationState.sourceDraftId);
      return;
    }
    void handleGenerate();
  };

  // Determine if the "Generate AI Draft" button should be shown:
  // 1. The conversation has at least one inbound message
  // 2. Latest message is inbound (prevents drafting again after already replying)
  // 3. No pending draft exists anywhere in the drafts list
  // 4. No generation is currently in progress
  const hasInboundMessage = messages.some((m) => m.direction === 'in');
  const latestMessage = messages[messages.length - 1];
  const latestMessageIsInbound = latestMessage?.direction === 'in';
  const hasPendingDraft = drafts?.some((d) => d.status === 'pending') ?? false;
  const showGenerateButton = hasInboundMessage && latestMessageIsInbound && !hasPendingDraft && !generationInFlight;
  const showGenerationStatus = generationState && (generationInFlight || generationState.phase === 'ready' || generationState.phase === 'error');
  const statusCopy = generationState ? getGenerationStatusCopy(generationState) : null;
  const hasGenerationError = generationState?.phase === 'error';
  const hasGenerationReady = generationState?.phase === 'ready';

  return (
    <div className="space-y-4 p-4">
      {messages.map((message, index) => {
        const messageDraft = draftsByMessageId.get(message.id);
        return (
          <div key={message.id}>
            <EmailMessage
              message={message}
              guestName={guestName}
              conversationId={conversationId}
            />
            {/* Show draft inline after its triggering message */}
            {messageDraft && onApproveDraft && onRejectDraft && (
              <div className="mt-2 ml-4">
                <DraftCard
                  draft={messageDraft}
                  onApprove={onApproveDraft}
                  onReject={onRejectDraft}
                  onRegenerate={handleRegenerate}
                  showRegenerate={messageDraft.status === 'rejected' || messageDraft.status === 'failed'}
                  isPending={isApprovePending}
                  isRegenerating={generationInFlight}
                />
              </div>
            )}
            {/* Show booking badges after the last message in an OTA conversation */}
            {isOtaConversation && index === messages.length - 1 && linkedBookings.length > 0 && (
              <div className="mt-2 space-y-1">
                {linkedBookings.map((booking) => (
                  <OtaBookingBadge
                    key={booking.id}
                    bookingId={booking.id}
                    needsReview={booking.needsReview}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {/* Orphan drafts (no messageId) shown at the bottom */}
      {orphanDrafts.length > 0 && onApproveDraft && onRejectDraft && (
        <div className="space-y-2">
          {orphanDrafts.map((draft) => (
            <div key={draft.id} className="ml-4">
              <DraftCard
                draft={draft}
                onApprove={onApproveDraft}
                onReject={onRejectDraft}
                onRegenerate={handleRegenerate}
                showRegenerate={draft.status === 'rejected' || draft.status === 'failed'}
                isPending={isApprovePending}
                isRegenerating={generationInFlight}
              />
            </div>
          ))}
        </div>
      )}
      {showGenerationStatus && generationState && statusCopy && (
        <Card className={hasGenerationError ? 'border-2 border-destructive/40 bg-destructive/5' : hasGenerationReady ? 'border-2 border-green-300/40 bg-green-50/60' : 'border-2 border-primary/20 bg-primary/5'}>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              {hasGenerationError ? (
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              ) : hasGenerationReady ? (
                <CheckCircle2 className="h-5 w-5 text-green-700 shrink-0 mt-0.5" />
              ) : generationState.phase === 'queued' ? (
                <Clock3 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              ) : (
                <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${hasGenerationError ? 'text-destructive' : hasGenerationReady ? 'text-green-800' : 'text-primary'}`}>
                  {statusCopy.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {statusCopy.description}
                </p>
                {generationState.jobId && !hasGenerationError && (
                  <p className="mt-1 text-[11px] text-muted-foreground font-mono">
                    job: {generationState.jobId}
                  </p>
                )}
              </div>
              {hasGenerationError && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={retryGeneration}
                  disabled={generationInFlight}
                >
                  Retry
                </Button>
              )}
              {hasGenerationReady && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setGenerationState(null)}
                >
                  Dismiss
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      {/* Manual generate button for conversations without pending drafts */}
      {showGenerateButton && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void handleGenerate();
            }}
            disabled={generationInFlight}
          >
            {generationInFlight ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate AI Draft
              </>
            )}
          </Button>
        </div>
      )}
      {!hasInboundMessage && (
        <Card className="border border-muted bg-muted/20">
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">
              Draft generation is available after at least one inbound customer message.
            </p>
          </CardContent>
        </Card>
      )}
      {hasInboundMessage && hasPendingDraft && (
        <Card className="border border-muted bg-muted/20">
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">
              A pending draft already exists. Review or reject it before generating a new one.
            </p>
          </CardContent>
        </Card>
      )}
      {hasInboundMessage && !latestMessageIsInbound && !hasPendingDraft && (
        <Card className="border border-muted bg-muted/20">
          <CardContent className="py-3">
            <p className="text-xs text-muted-foreground">
              Latest message is your reply. Wait for a new inbound message before generating another draft.
            </p>
          </CardContent>
        </Card>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
