'use client';

import { useEffect, useRef } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmailMessage } from './email-message';
import { OtaBookingBadge } from './ota-booking-badge';
import { DraftCard } from './draft-card';
import { useGenerateDraft } from '@/lib/hooks/use-conversations';
import type { Message, LinkedBooking, AiDraft } from '@/lib/hooks/use-conversations';

interface ConversationThreadProps {
  messages: Message[];
  guestName: string;
  conversationId: string;
  bookings?: LinkedBooking[];
  classification?: string | null;
  drafts?: AiDraft[];
  onApproveDraft?: (content: string) => void;
  onRejectDraft?: (draftId: string) => void;
  isApprovePending?: boolean;
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
  const generateDraft = useGenerateDraft(conversationId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, drafts]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-center">
        <p className="text-muted-foreground">No messages yet</p>
      </div>
    );
  }

  // Determine if we should show booking badges after the last message
  const isOtaConversation = classification === 'ota_notification';
  const linkedBookings = bookings ?? [];

  // Drafts that have a messageId (inline after their triggering message)
  const draftsByMessageId = new Map<string, AiDraft>();
  // Drafts without a messageId (legacy/fallback -- shown at the bottom)
  const orphanDrafts: AiDraft[] = [];

  if (drafts) {
    for (const draft of drafts) {
      if (draft.messageId) {
        draftsByMessageId.set(draft.messageId, draft);
      } else {
        orphanDrafts.push(draft);
      }
    }
  }

  // Handler for retry/regeneration that uses the generate endpoint (more robust)
  const handleRegenerate = (): void => {
    generateDraft.mutate();
  };

  // Determine if the "Generate AI Draft" button should be shown:
  // 1. The conversation has at least one inbound message
  // 2. No pending draft exists anywhere in the drafts list
  // 3. No generation is currently in progress
  const hasInboundMessage = messages.some((m) => m.direction === 'in');
  const hasPendingDraft = drafts?.some((d) => d.status === 'pending') ?? false;
  const showGenerateButton = hasInboundMessage && !hasPendingDraft && !generateDraft.isPending;

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
                  isRegenerating={generateDraft.isPending}
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
                isRegenerating={generateDraft.isPending}
              />
            </div>
          ))}
        </div>
      )}
      {/* Generating spinner while draft is being created */}
      {generateDraft.isPending && (
        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
              <div>
                <p className="text-sm font-medium text-primary">Generating AI draft...</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The AI is composing a reply. This usually takes 10-30 seconds.
                </p>
              </div>
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
            onClick={() => generateDraft.mutate()}
            disabled={generateDraft.isPending}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate AI Draft
          </Button>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
