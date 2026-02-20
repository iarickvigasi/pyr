'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationList } from './conversation-list';
import { ConversationThread } from './conversation-thread';
import { DraftCard } from './draft-card';
import { MessageComposer } from './message-composer';
import { ReclassifyDropdown } from './reclassify-dropdown';
import {
  useConversations,
  useConversation,
  useConversationDrafts,
  useSendMessage,
  useApproveDraft,
} from '@/lib/hooks/use-conversations';
import { toast } from 'sonner';

export function InboxPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<string>();

  const { data: conversationsData, isLoading: conversationsLoading } = useConversations();
  const { data: conversationData, isLoading: conversationLoading } =
    useConversation(selectedConversationId);
  const { data: draftsData } = useConversationDrafts(selectedConversationId);

  const sendMessage = useSendMessage(selectedConversationId ?? '');
  const approveDraft = useApproveDraft(selectedConversationId ?? '');

  const conversations = conversationsData ?? [];
  const conversation = conversationData;
  const drafts = draftsData ?? [];
  const pendingDraft = drafts.find((d) => d.status === 'pending');

  const handleSendMessage = async (content: string) => {
    try {
      await sendMessage.mutateAsync({ content });
      toast.success('Message sent successfully');
    } catch {
      toast.error('Failed to send message');
    }
  };

  const handleApproveDraft = async (content: string) => {
    if (!pendingDraft) return;

    try {
      const isEdited = content !== pendingDraft.content;
      await approveDraft.mutateAsync({
        draftId: pendingDraft.id,
        content: isEdited ? content : undefined,
      });
      toast.success('Message sent successfully');
    } catch {
      toast.error('Failed to send message');
    }
  };

  const handleRejectDraft = () => {
    toast.info('Draft rejected. You can compose a manual reply below.');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="shrink-0 pb-4">
        <h1 className="text-3xl font-bold">Inbox</h1>
        <p className="text-muted-foreground">Unified communication hub</p>
      </div>

      {/* Two-Pane Layout */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Left: Conversation List */}
        <div className="w-80 shrink-0 border rounded-lg overflow-hidden flex flex-col">
          {conversationsLoading ? (
            <div className="p-4 space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <ConversationList
                conversations={conversations}
                selectedId={selectedConversationId}
                onSelect={setSelectedConversationId}
              />
            </div>
          )}
        </div>

        {/* Right: Conversation Detail */}
        <div className="flex-1 border rounded-lg overflow-hidden flex flex-col min-w-0">
          {!selectedConversationId ? (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Select a conversation to view messages
                </p>
              </div>
            </div>
          ) : conversationLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : conversation ? (
            <div className="flex flex-col h-full">
              {/* Conversation Header */}
              <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b bg-muted/20">
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm truncate">
                    {conversation.guest?.name ?? 'Unknown Sender'}
                  </h2>
                  {conversation.subject && (
                    <p className="text-xs text-muted-foreground truncate">
                      {conversation.subject}
                    </p>
                  )}
                </div>
                <div className="shrink-0 ml-4">
                  <ReclassifyDropdown
                    conversationId={conversation.id}
                    currentClassification={conversation.classification}
                  />
                </div>
              </div>

              {/* Message Thread */}
              <div className="flex-1 overflow-y-auto">
                <ConversationThread
                  messages={conversation.messages}
                  guestName={conversation.guest?.name ?? 'Unknown Sender'}
                  conversationId={conversation.id}
                />
              </div>

              {/* AI Draft (if pending) */}
              {pendingDraft && (
                <div className="shrink-0 px-4 py-3 border-t">
                  <DraftCard
                    draft={pendingDraft}
                    onApprove={handleApproveDraft}
                    onReject={handleRejectDraft}
                    isPending={approveDraft.isPending}
                  />
                </div>
              )}

              {/* Manual Reply Composer */}
              {!pendingDraft && (
                <div className="shrink-0 px-4 py-3 border-t">
                  <MessageComposer
                    onSend={handleSendMessage}
                    isPending={sendMessage.isPending}
                    placeholder={`Reply to ${conversation.guest?.name ?? 'Unknown Sender'}...`}
                  />
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
