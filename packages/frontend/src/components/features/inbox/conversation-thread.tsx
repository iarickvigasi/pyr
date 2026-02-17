'use client';

import { useEffect, useRef } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import type { Message } from '@/lib/hooks/use-conversations';

interface ConversationThreadProps {
  messages: Message[];
  guestName: string;
}

export function ConversationThread({ messages, guestName }: ConversationThreadProps) {
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
    <div className="space-y-4 p-6">
      {messages.map((message) => {
        const isInbound = message.direction === 'in';
        const Icon = isInbound ? ArrowDown : ArrowUp;

        return (
          <div
            key={message.id}
            className={cn(
              'flex gap-3',
              isInbound ? 'flex-row' : 'flex-row-reverse'
            )}
          >
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                isInbound ? 'bg-muted' : 'bg-primary text-primary-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="sr-only">{isInbound ? 'Received' : 'Sent'}</span>
            </div>

            <div
              className={cn(
                'flex flex-col gap-2 rounded-lg px-4 py-3 max-w-[75%]',
                isInbound
                  ? 'bg-muted'
                  : 'bg-primary text-primary-foreground'
              )}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">
                  {isInbound ? guestName : 'You'}
                </span>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={isInbound ? 'secondary' : 'outline'}
                    className={cn(
                      'text-xs',
                      !isInbound && 'bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20'
                    )}
                  >
                    {message.channel}
                  </Badge>
                  <time
                    className={cn(
                      'text-xs whitespace-nowrap',
                      isInbound ? 'text-muted-foreground' : 'text-primary-foreground/70'
                    )}
                  >
                    {formatDateTime(message.sentAt)}
                  </time>
                </div>
              </div>

              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {message.content}
              </p>
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}
