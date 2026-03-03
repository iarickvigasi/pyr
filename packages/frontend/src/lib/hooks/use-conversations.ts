import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';

// Types
export interface MessageAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentId: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: 'in' | 'out';
  content: string;
  channel: string;
  htmlContent: string | null;
  fromAddress: string | null;
  fromName: string | null;
  subject: string | null;
  attachments?: MessageAttachment[];
  sentAt: string;
  createdAt: string;
}

export interface AiDraft {
  id: string;
  messageId: string | null;
  conversationId: string;
  content: string;
  status: 'pending' | 'approved' | 'edited' | 'rejected' | 'failed';
  model: string;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costEur: number;
  provider: string;
  durationMs: number;
  flags: string[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  guestId: string | null;
  channel: string;
  subject: string | null;
  status: string;
  classification: string | null;
  isRead: boolean;
  messagePreview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  guest: {
    id: string;
    name: string;
    email: string | null;
    language?: string;
  } | null;
}

export interface LinkedBooking {
  id: string;
  status: string;
  needsReview: boolean;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
  bookings?: LinkedBooking[];
}

export interface ConversationFilters extends Record<string, string | number | boolean | undefined> {
  status?: string;
  channel?: string;
  guestId?: string;
  bucket?: 'conversation_ota' | 'other';
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

export interface CustomerSuggestion {
  status: 'linked' | 'matched_existing' | 'needs_create' | 'insufficient_data' | 'not_applicable';
  classification: string | null;
  reason: string;
  matchedGuest?: {
    id: string;
    name: string;
    email: string | null;
  } | null;
  candidate?: {
    name: string | null;
    email: string | null;
    phone: string | null;
    shouldCreate: boolean;
  } | null;
}

export interface ConversationBookingAnalysis {
  status: 'ready' | 'insufficient_data' | 'not_applicable' | 'error';
  reason: string;
  classification: string | null;
  missingFields: Array<'checkIn' | 'checkOut'>;
  candidate: {
    checkIn: string | null;
    checkOut: string | null;
    totalPrice: number | null;
    currency: 'EUR' | null;
    source: string | null;
    notes: string | null;
    guest: {
      name: string | null;
      email: string | null;
      phone: string | null;
    };
    confidence: number | null;
  } | null;
}

export interface CreateConversationBookingPayload {
  guest: {
    mode: 'linked' | 'existing' | 'create';
    guestId?: string;
    name?: string;
    email?: string;
    phone?: string;
    language?: 'en' | 'de';
  };
  booking: {
    roomId: string;
    checkIn: string;
    checkOut: string;
    totalPrice: number;
    status?: 'inquiry' | 'confirmed';
    source?: string | null;
    notes?: string | null;
  };
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
    refetchInterval: 30_000,
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
    refetchInterval: 5_000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: queryKeys.conversations.unreadCount,
    queryFn: async () => {
      const response = await api.get<{ data: { count: number } }>(
        '/api/v1/conversations/unread-count'
      );
      return response.data.count;
    },
    refetchInterval: 30_000,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.unreadCount });
    },
  });
}

export function useApproveDraft(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ApproveDraftData) => {
      const response = await api.post<{ data: Message }>(
        `/api/v1/conversations/${conversationId}/drafts/${data.draftId}/approve`,
        { content: data.content }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.drafts(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.unreadCount });
    },
  });
}

export function useRejectDraft(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (draftId: string) => {
      const response = await api.post<{ data: AiDraft }>(
        `/api/v1/conversations/${conversationId}/drafts/${draftId}/reject`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.drafts(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
  });
}

export function useRegenerateDraft(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (draftId: string) => {
      const response = await api.post<{ data: AiDraft }>(
        `/api/v1/conversations/${conversationId}/drafts/${draftId}/regenerate`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.drafts(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
  });
}

export function useGenerateDraft(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post<{ data: { jobId: string; messageId: string } }>(
        `/api/v1/conversations/${conversationId}/drafts/generate`
      );
      return response.data;
    },
    onSuccess: () => {
      if (conversationId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.conversations.drafts(conversationId) });
      }
    },
  });
}

export function useUpdateConversation(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { classification?: string; status?: string }) => {
      const response = await api.patch<{ data: Conversation }>(
        `/api/v1/conversations/${conversationId}`,
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

export function useConversationCustomerSuggestion(conversationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conversations.suggestion(conversationId ?? ''),
    queryFn: async () => {
      const response = await api.get<{ data: CustomerSuggestion }>(
        `/api/v1/conversations/${conversationId}/customer-suggestion`
      );
      return response.data;
    },
    enabled: !!conversationId,
    refetchInterval: 15_000,
  });
}

export function useLinkConversationGuest(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (guestId: string) => {
      const response = await api.post<{ data: Conversation }>(
        `/api/v1/conversations/${conversationId}/link-guest`,
        { guestId }
      );
      return response.data;
    },
    onSuccess: () => {
      if (!conversationId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.suggestion(conversationId) });
    },
  });
}

export function useCreateConversationGuest(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { name?: string; email?: string; phone?: string; language?: 'en' | 'de' }) => {
      const response = await api.post<{ data: { guest: { id: string }; conversation: Conversation } }>(
        `/api/v1/conversations/${conversationId}/create-guest`,
        payload
      );
      return response.data;
    },
    onSuccess: () => {
      if (!conversationId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.suggestion(conversationId) });
    },
  });
}

export function useAnalyzeConversationBooking(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post<{ data: ConversationBookingAnalysis }>(
        `/api/v1/conversations/${conversationId}/booking-analysis`
      );
      return response.data;
    },
    onSuccess: () => {
      if (!conversationId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.bookingAnalysis(conversationId) });
    },
  });
}

export function useCreateConversationBooking(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateConversationBookingPayload) => {
      const response = await api.post<{
        data: {
          booking: { id: string; sourceConversationId: string | null };
          guest: { id: string; name: string; email: string | null };
          conversation: Conversation;
        };
      }>(
        `/api/v1/conversations/${conversationId}/bookings`,
        payload
      );
      return response.data;
    },
    onSuccess: () => {
      if (!conversationId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.suggestion(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.today });
    },
  });
}
