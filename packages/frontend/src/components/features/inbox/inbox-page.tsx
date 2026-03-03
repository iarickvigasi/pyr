'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConversationList } from './conversation-list';
import { ConversationThread } from './conversation-thread';
import { MessageComposer } from './message-composer';
import { ReclassifyDropdown } from './reclassify-dropdown';
import { CustomerSuggestionCard } from './customer-suggestion-card';
import {
  useConversations,
  useConversation,
  useConversationDrafts,
  useSendMessage,
  useApproveDraft,
  useRejectDraft,
  useConversationCustomerSuggestion,
  useLinkConversationGuest,
  useCreateConversationGuest,
} from '@/lib/hooks/use-conversations';
import { toast } from 'sonner';

export function InboxPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<string>();
  const [activeBucket, setActiveBucket] = useState<'conversation_ota' | 'other'>('conversation_ota');
  const [composerContent, setComposerContent] = useState('');
  const [preparedDraft, setPreparedDraft] = useState<{
    draftId: string;
    originalContent: string;
  } | null>(null);

  const { data: conversationsData, isLoading: conversationsLoading } =
    useConversations({ bucket: activeBucket });
  const { data: conversationData, isLoading: conversationLoading } =
    useConversation(selectedConversationId);
  const { data: draftsData } = useConversationDrafts(selectedConversationId);
  const { data: suggestionData, isLoading: suggestionLoading } =
    useConversationCustomerSuggestion(selectedConversationId);

  const sendMessage = useSendMessage(selectedConversationId ?? '');
  const approveDraft = useApproveDraft(selectedConversationId ?? '');
  const rejectDraft = useRejectDraft(selectedConversationId ?? '');
  const linkGuest = useLinkConversationGuest(selectedConversationId);
  const createGuest = useCreateConversationGuest(selectedConversationId);

  const conversations = conversationsData ?? [];
  const conversation = conversationData;
  const drafts = draftsData ?? [];

  useEffect(() => {
    setSelectedConversationId(undefined);
  }, [activeBucket]);

  useEffect(() => {
    setComposerContent('');
    setPreparedDraft(null);
  }, [selectedConversationId]);

  const handleSendMessage = async (content: string): Promise<void> => {
    if (preparedDraft) {
      try {
        const isEdited = content !== preparedDraft.originalContent;
        await approveDraft.mutateAsync({
          draftId: preparedDraft.draftId,
          content: isEdited ? content : undefined,
        });
        setComposerContent('');
        setPreparedDraft(null);
        toast.success('Approved draft sent successfully');
      } catch {
        toast.error('Failed to send approved draft');
      }
      return;
    }

    try {
      await sendMessage.mutateAsync({ content });
      setComposerContent('');
      toast.success('Message sent successfully');
    } catch {
      toast.error('Failed to send message');
    }
  };

  const handleApproveDraft = async (payload: {
    draftId: string;
    content: string;
    originalContent: string;
  }): Promise<void> => {
    setPreparedDraft({
      draftId: payload.draftId,
      originalContent: payload.originalContent,
    });
    setComposerContent(payload.content);
    toast.info('Draft pasted into composer. Click Send to deliver email.');
  };

  const handleRejectDraft = async (draftId: string): Promise<void> => {
    try {
      await rejectDraft.mutateAsync(draftId);
      if (preparedDraft?.draftId === draftId) {
        setPreparedDraft(null);
      }
      toast.info('Draft rejected. You can compose a manual reply or generate a new draft.');
    } catch {
      toast.error('Failed to reject draft');
    }
  };

  const handleLinkGuest = async (guestId: string): Promise<void> => {
    try {
      await linkGuest.mutateAsync(guestId);
      toast.success('Customer linked to conversation');
    } catch {
      toast.error('Failed to link customer');
    }
  };

  const handleCreateGuest = async (payload: { name?: string; email?: string; phone?: string }): Promise<void> => {
    try {
      await createGuest.mutateAsync(payload);
      toast.success('Customer created and linked');
    } catch {
      toast.error('Failed to create customer');
    }
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
          <div className="border-b p-2">
            <Tabs value={activeBucket} onValueChange={(value) => setActiveBucket(value as 'conversation_ota' | 'other')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="conversation_ota">Conversations/OTA</TabsTrigger>
                <TabsTrigger value="other">Other</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
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
                    {conversation.guest ? (
                      <Link
                        href={`/guests/${conversation.guest.id}`}
                        className="hover:underline text-primary"
                      >
                        {conversation.guest.name}
                      </Link>
                    ) : (
                      'Unknown Sender'
                    )}
                  </h2>
                  {conversation.subject && (
                    <p className="text-xs text-muted-foreground truncate">
                      {conversation.subject}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    {conversation.guest && (
                      <Link
                        href={`/guests/${conversation.guest.id}`}
                        className="text-primary hover:underline"
                      >
                        Open customer
                      </Link>
                    )}
                    {conversation.bookings?.map((booking) => (
                      <Link
                        key={booking.id}
                        href={`/bookings/${booking.id}`}
                        className="text-primary hover:underline"
                      >
                        Booking {booking.id.slice(-6)}
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 ml-4">
                  <ReclassifyDropdown
                    conversationId={conversation.id}
                    currentClassification={conversation.classification}
                  />
                </div>
              </div>

              {!conversation.guest && (
                <div className="shrink-0 border-b px-4 py-2">
                  <CustomerSuggestionCard
                    suggestion={suggestionData}
                    isLoading={suggestionLoading}
                    onLinkExisting={handleLinkGuest}
                    onCreateGuest={handleCreateGuest}
                    isLinking={linkGuest.isPending}
                    isCreating={createGuest.isPending}
                  />
                </div>
              )}

              {/* Message Thread (drafts now rendered inline) */}
              <div className="flex-1 overflow-y-auto">
                <ConversationThread
                  messages={conversation.messages}
                  guestName={conversation.guest?.name ?? 'Unknown Sender'}
                  conversationId={conversation.id}
                  bookings={conversation.bookings}
                  classification={conversation.classification}
                  drafts={drafts}
                  onApproveDraft={handleApproveDraft}
                  onRejectDraft={handleRejectDraft}
                  isApprovePending={approveDraft.isPending || sendMessage.isPending}
                />
              </div>

              {/* Manual Reply Composer -- always available */}
              <div className="shrink-0 px-4 py-3 border-t">
                <MessageComposer
                  value={composerContent}
                  onChange={setComposerContent}
                  onSend={handleSendMessage}
                  isPending={sendMessage.isPending || approveDraft.isPending}
                  placeholder={
                    preparedDraft
                      ? `Review approved draft for ${conversation.guest?.name ?? 'Unknown Sender'} and click Send...`
                      : `Reply to ${conversation.guest?.name ?? 'Unknown Sender'}...`
                  }
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
