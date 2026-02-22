"use client";

import type { ChatMessage, ToolCall } from '@/lib/hooks/use-assistant';
import { MessageBubble } from './message-bubble';
import { ToolIndicator } from './tool-indicator';
import { TypingIndicator } from './typing-indicator';

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  activeTools: ToolCall[];
  toolLabel: (name: string) => string;
}

export function MessageList({ messages, isStreaming, activeTools, toolLabel }: MessageListProps) {
  // Show typing indicator when streaming but the latest assistant message has no content yet
  const lastMessage = messages[messages.length - 1];
  const showTypingIndicator =
    isStreaming &&
    lastMessage?.role === 'assistant' &&
    !lastMessage.content;

  // Show active tool indicators (tools that are currently running)
  const showToolIndicators =
    isStreaming &&
    activeTools.filter(t => t.status === 'active').length > 0;

  return (
    <div className="flex flex-col gap-3 py-4">
      {messages.map((message) => {
        // Skip rendering empty assistant messages (the typing indicator handles that)
        if (message.role === 'assistant' && !message.content && isStreaming) {
          return null;
        }
        return <MessageBubble key={message.id} message={message} />;
      })}

      {showToolIndicators && (
        <div className="flex flex-col gap-0.5">
          {activeTools
            .filter(t => t.status === 'active')
            .map((tc) => (
              <ToolIndicator
                key={tc.name}
                toolCall={tc}
                label={toolLabel(tc.name)}
              />
            ))}
        </div>
      )}

      {showTypingIndicator && <TypingIndicator />}
    </div>
  );
}
