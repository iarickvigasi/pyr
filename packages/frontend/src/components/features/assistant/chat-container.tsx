"use client";

import { useRef, useEffect } from 'react';
import { PawPrint, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAssistant } from '@/lib/hooks/use-assistant';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import { QuickActions } from './quick-actions';

export function ChatContainer() {
  const {
    messages,
    isStreaming,
    activeTools,
    sendMessage,
    resetSession,
    toolLabel,
  } = useAssistant();

  const scrollRef = useRef<HTMLDivElement>(null);
  const isEmpty = messages.length === 0;

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTools, isStreaming]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <PawPrint className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Koda</h1>
          <span className="text-sm text-muted-foreground">AI Assistant</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetSession}
          disabled={isStreaming}
          className="gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New conversation</span>
        </Button>
      </div>

      {/* Message area */}
      {isEmpty ? (
        <QuickActions onAction={sendMessage} />
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 lg:px-4">
          <div className="mx-auto max-w-3xl">
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              activeTools={activeTools}
              toolLabel={toolLabel}
            />
          </div>
        </div>
      )}

      {/* Input bar */}
      <ChatInput onSend={sendMessage} isStreaming={isStreaming} />
    </div>
  );
}
