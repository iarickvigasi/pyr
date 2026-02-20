'use client';

import { useEffect, useRef } from 'react';
import { EmailMessage } from './email-message';
import type { Message } from '@/lib/hooks/use-conversations';

interface ConversationThreadProps {
  messages: Message[];
  guestName: string;
  conversationId: string;
}

export function ConversationThread({ messages, guestName, conversationId }: ConversationThreadProps) {
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

  return (
    <div className="space-y-4 p-4">
      {messages.map((message) => (
        <EmailMessage
          key={message.id}
          message={message}
          guestName={guestName}
          conversationId={conversationId}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
