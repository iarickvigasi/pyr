'use client';

import { Mail, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
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
        const channelIcon = conversation.channel === 'email' ? Mail : MessageCircle;
        const Icon = channelIcon;

        return (
          <div
            key={conversation.id}
            className={cn(
              'p-4 cursor-pointer hover:bg-muted/50 transition-colors',
              isSelected && 'bg-muted border-l-4 border-l-primary'
            )}
            onClick={() => onSelect(conversation.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <Icon className="h-5 w-5 text-muted-foreground mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium truncate">{conversation.guest?.name ?? 'Unknown Sender'}</p>
                    <Badge
                      variant={
                        conversation.status === 'open'
                          ? 'default'
                          : conversation.status === 'closed'
                            ? 'secondary'
                            : 'outline'
                      }
                      className="text-xs flex-shrink-0"
                    >
                      {conversation.status}
                    </Badge>
                  </div>
                  {conversation.subject && (
                    <p className="text-sm text-muted-foreground truncate mb-1">
                      {conversation.subject}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">
                      {conversation.channel}
                    </Badge>
                    {conversation.guest?.language && (
                      <Badge variant="outline" className="text-xs">
                        {conversation.guest.language.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              {conversation.lastMessageAt && (
                <time className="text-xs text-muted-foreground flex-shrink-0">
                  {formatDateTime(conversation.lastMessageAt).split(', ')[1]}
                </time>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
