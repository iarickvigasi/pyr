'use client';

import { useEffect, useRef } from 'react';
import { EmailMessage } from './email-message';
import { OtaBookingBadge } from './ota-booking-badge';
import type { Message, LinkedBooking } from '@/lib/hooks/use-conversations';

interface ConversationThreadProps {
  messages: Message[];
  guestName: string;
  conversationId: string;
  bookings?: LinkedBooking[];
  classification?: string | null;
}

export function ConversationThread({
  messages,
  guestName,
  conversationId,
  bookings,
  classification,
}: ConversationThreadProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  return (
    <div className="space-y-4 p-4">
      {messages.map((message, index) => (
        <div key={message.id}>
          <EmailMessage
            message={message}
            guestName={guestName}
            conversationId={conversationId}
          />
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
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
