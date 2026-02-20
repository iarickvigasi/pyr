'use client';

import { useEffect, useRef } from 'react';
import { EmailMessage } from './email-message';
import { OtaBookingBadge } from './ota-booking-badge';
import { DraftCard } from './draft-card';
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
  onRegenerateDraft?: (draftId: string) => void;
  isApprovePending?: boolean;
  isRejectPending?: boolean;
  isRegeneratePending?: boolean;
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
  onRegenerateDraft,
  isApprovePending,
  isRegeneratePending,
}: ConversationThreadProps) {
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
                  onRegenerate={onRegenerateDraft}
                  showRegenerate={messageDraft.status === 'rejected' || messageDraft.status === 'failed'}
                  isPending={isApprovePending}
                  isRegenerating={isRegeneratePending}
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
                onRegenerate={onRegenerateDraft}
                showRegenerate={draft.status === 'rejected' || draft.status === 'failed'}
                isPending={isApprovePending}
                isRegenerating={isRegeneratePending}
              />
            </div>
          ))}
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
