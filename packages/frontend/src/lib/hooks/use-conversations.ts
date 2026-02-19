import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';

// Types
export interface Message {
  id: string;
  conversationId: string;
  direction: 'in' | 'out';
  content: string;
  channel: string;
  sentAt: string;
  createdAt: string;
}

export interface AiDraft {
  id: string;
  messageId: string | null;
  conversationId: string;
  content: string;
  status: 'pending' | 'approved' | 'edited' | 'rejected';
  model: string;
  tokensUsed: number;
  createdAt: string;
}

export interface Conversation {
  id: string;
  guestId: string;
  channel: string;
  subject: string | null;
  status: string;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  guest: {
    id: string;
    name: string;
    email: string | null;
    language: string;
  };
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

export interface ConversationFilters extends Record<string, string | number | boolean | undefined> {
  status?: string;
  channel?: string;
  guestId?: string;
  cursor?: string;
  limit?: number;
}

export interface SendMessageData {
  content: string;
  channel?: string;
}

export interface ApproveDraftData {
  draftId: string;
  content?: string; // If edited
}

// Hooks
export function useConversations(filters?: ConversationFilters) {
  return useQuery({
    queryKey: queryKeys.conversations.list(filters as Record<string, unknown>),
    queryFn: async () => {
      const response = await api.get<{
        data: Conversation[];
        nextCursor: string | null;
        hasMore: boolean;
      }>('/api/v1/conversations', { params: filters as Record<string, string | number | boolean | undefined> });
      return response.data;
    },
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conversations.detail(id!),
    queryFn: async () => {
      const response = await api.get<{ data: ConversationWithMessages }>(
        `/api/v1/conversations/${id}`
      );
      return response.data;
    },
    enabled: !!id,
  });
}

export function useConversationDrafts(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conversations.drafts(id!),
    queryFn: async () => {
      const response = await api.get<{ data: AiDraft[] }>(
        `/api/v1/conversations/${id}/drafts`
      );
      return response.data;
    },
    enabled: !!id,
  });
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SendMessageData) => {
      const response = await api.post<{ data: Message }>(
        `/api/v1/conversations/${conversationId}/reply`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
  });
}

export function useApproveDraft(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ApproveDraftData) => {
      const response = await api.post<{ data: Message }>(
        `/api/v1/conversations/${conversationId}/approve`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.drafts(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
  });
}
