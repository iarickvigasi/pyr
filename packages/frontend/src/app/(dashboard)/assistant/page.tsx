"use client";

import { ChatContainer } from '@/components/features/assistant/chat-container';

export default function AssistantPage() {
  return (
    <div className="-m-6 h-[calc(100vh-3.5rem)] lg:h-screen">
      <ChatContainer />
    </div>
  );
}
