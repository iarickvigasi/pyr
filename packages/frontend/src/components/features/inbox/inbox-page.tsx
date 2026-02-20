'use client';

import { useState } from 'react';
import { Mail, Filter, Inbox as InboxIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConversationList } from './conversation-list';
import { ConversationThread } from './conversation-thread';
import { DraftCard } from './draft-card';
import { MessageComposer } from './message-composer';
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
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');

  const filters = {
    status: statusFilter !== 'all' ? statusFilter : undefined,
    channel: channelFilter !== 'all' ? channelFilter : undefined,
  };

  const { data: conversationsData, isLoading: conversationsLoading } = useConversations(filters);
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
    } catch (error) {
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
    } catch (error) {
      toast.error('Failed to send message');
    }
  };

  const handleRejectDraft = () => {
    toast.info('Draft rejected. You can compose a manual reply below.');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inbox</h1>
          <p className="text-muted-foreground">Unified communication hub</p>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="telegram">Telegram</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Conversations</CardTitle>
            <InboxIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {conversationsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                conversations.length
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {conversationsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                conversations.filter((c) => c.status === 'open').length
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Drafts</CardTitle>
            <Filter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {conversationsLoading ? <Skeleton className="h-8 w-16" /> : 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two-Pane Layout */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Left: Conversation List */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Conversations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {conversationsLoading ? (
              <div className="p-4 space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <div className="max-h-[600px] overflow-y-auto">
                <ConversationList
                  conversations={conversations}
                  selectedId={selectedConversationId}
                  onSelect={setSelectedConversationId}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Message Thread */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>
              {conversation ? (conversation.guest?.name ?? 'Unknown Sender') : 'Select a conversation'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedConversationId ? (
              <div className="flex items-center justify-center h-[600px] text-center">
                <div>
                  <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    Select a conversation to view messages
                  </p>
                </div>
              </div>
            ) : conversationLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-3/4" />
                <Skeleton className="h-20 w-3/4 ml-auto" />
                <Skeleton className="h-20 w-3/4" />
              </div>
            ) : conversation ? (
              <div className="space-y-6">
                {/* Message Thread */}
                <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                  <ConversationThread
                    messages={conversation.messages}
                    guestName={conversation.guest?.name ?? 'Unknown Sender'}
                  />
                </div>

                {/* AI Draft (if pending) */}
                {pendingDraft && (
                  <DraftCard
                    draft={pendingDraft}
                    onApprove={handleApproveDraft}
                    onReject={handleRejectDraft}
                    isPending={approveDraft.isPending}
                  />
                )}

                {/* Manual Reply Composer */}
                {!pendingDraft && (
                  <div className="border-t pt-6">
                    <h3 className="text-sm font-medium mb-4">Send Reply</h3>
                    <MessageComposer
                      onSend={handleSendMessage}
                      isPending={sendMessage.isPending}
                      placeholder={`Reply to ${conversation.guest?.name ?? 'Unknown Sender'}...`}
                    />
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
