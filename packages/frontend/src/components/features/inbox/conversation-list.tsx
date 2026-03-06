'use client';

import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/format';
import { ClassificationBadge } from './classification-badge';
import type { Conversation } from '@/lib/hooks/use-conversations';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No conversations yet</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {conversations.map((conversation) => {
        const isSelected = conversation.id === selectedId;
        const isUnread = !conversation.isRead;

        return (
          <div
            key={conversation.id}
            className={cn(
              'p-3 cursor-pointer hover:bg-muted/50 transition-colors',
              isSelected && 'bg-muted border-l-4 border-l-primary',
              isUnread && !isSelected && 'bg-primary/5'
            )}
            onClick={() => onSelect(conversation.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(conversation.id);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {isUnread && (
                    <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  )}
                  <p className={cn(
                    'truncate text-sm',
                    isUnread ? 'font-semibold' : 'font-medium'
                  )}>
                    {conversation.guest?.name ?? 'Unknown Sender'}
                  </p>
                </div>
                {conversation.subject && (
                  <p className={cn(
                    'text-xs truncate mb-0.5',
                    isUnread ? 'text-foreground font-medium' : 'text-muted-foreground'
                  )}>
                    {conversation.subject}
                  </p>
                )}
                {conversation.messagePreview && (
                  <p className="text-xs text-muted-foreground truncate">
                    {conversation.messagePreview}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <ClassificationBadge classification={conversation.classification} />
                </div>
              </div>
              {conversation.lastMessageAt && (
                <time className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                  {formatRelative(conversation.lastMessageAt)}
                </time>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
