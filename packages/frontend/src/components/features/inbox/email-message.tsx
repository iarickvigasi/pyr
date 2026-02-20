'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { EmailHtmlRenderer } from './email-html-renderer';
import { AttachmentList } from './attachment-list';
import type { Message } from '@/lib/hooks/use-conversations';

interface EmailMessageProps {
  message: Message;
  guestName: string | null;
  conversationId: string;
}

export function EmailMessage({ message, guestName, conversationId }: EmailMessageProps) {
  const [showDetails, setShowDetails] = useState(false);

  const isInbound = message.direction === 'in';
  const senderName = isInbound
    ? message.fromName || guestName || 'Unknown Sender'
    : 'Ines (Puppy Yoga Retreat)';

  const hasAttachments = message.attachments && message.attachments.length > 0;

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between px-4 py-3 rounded-t-lg',
          isInbound ? 'bg-muted/30' : 'bg-primary/5'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
            isInbound ? 'bg-muted' : 'bg-primary/10'
          )}>
            {isInbound ? (
              <ArrowDownLeft className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
            )}
          </div>
          <span className="font-medium text-sm truncate">{senderName}</span>
          <Badge
            variant={isInbound ? 'secondary' : 'outline'}
            className="text-xs shrink-0"
          >
            {isInbound ? 'Received' : 'Sent'}
          </Badge>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <time className="text-xs text-muted-foreground whitespace-nowrap">
            {formatDateTime(message.sentAt)}
          </time>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setShowDetails((v) => !v)}
            aria-label={showDetails ? 'Hide details' : 'Show details'}
          >
            {showDetails ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded Details */}
      {showDetails && (
        <div className="px-4 py-2 border-b bg-muted/10 text-xs space-y-1">
          {message.fromAddress && (
            <div>
              <span className="font-medium text-muted-foreground">From: </span>
              <span>
                {message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress}
              </span>
            </div>
          )}
          {message.subject && (
            <div>
              <span className="font-medium text-muted-foreground">Subject: </span>
              <span>{message.subject}</span>
            </div>
          )}
        </div>
      )}

      {/* Body */}
      <div className="px-4 py-3">
        {message.htmlContent ? (
          <EmailHtmlRenderer html={message.htmlContent} />
        ) : (
          <div className="text-sm whitespace-pre-wrap leading-relaxed">
            {message.content}
          </div>
        )}
      </div>

      {/* Attachments */}
      {hasAttachments && (
        <div className="px-4 pb-3 border-t pt-3">
          <AttachmentList
            attachments={message.attachments!}
            conversationId={conversationId}
            messageId={message.id}
          />
        </div>
      )}
    </div>
  );
}
