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

export interface LinkedEventRegistration {
  id: string;
  status: 'confirmed' | 'waitlisted' | 'cancelled';
  attendeeCount: number;
  sourceConversationId: string | null;
  event: {
    id: string;
    title: string;
    date: string;
    time: string;
    type: string;
  };
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
  bookings?: LinkedBooking[];
  eventRegistrations?: LinkedEventRegistration[];
}

export interface ConversationFilters extends Record<string, string | number | boolean | undefined> {
  status?: string;
  channel?: string;
  guestId?: string;
  bucket?: 'conversation' | 'ota' | 'other' | 'conversation_ota';
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

export interface ConversationEventAnalysis {
  status: 'pending' | 'ready' | 'insufficient_data' | 'not_applicable' | 'error';
  provider: string;
  reason: string;
  classification: string | null;
  intent: 'create_or_link' | 'cancel' | 'move' | null;
  missingFields: Array<'externalBookingId' | 'eventDate' | 'eventTime'>;
  candidate: {
    externalBookingId: string | null;
    externalProductCode: string | null;
    eventType: 'puppy_yoga' | 'beach_walk' | 'coffee_cake_cuddles' | 'retreat' | null;
    eventTitle: string | null;
    eventDate: string | null;
    eventTime: string | null;
    location: string | null;
    attendeeCount: number | null;
    guest: {
      name: string | null;
      email: string | null;
      phone: string | null;
    };
    confidence: number | null;
  } | null;
  resolution: {
    matchedGuestId: string | null;
    matchedEventId: string | null;
    matchedEventBookingId: string | null;
    recommendedOperation: 'create_or_link' | 'cancel' | 'move' | 'none';
    guestFieldDiffs: {
      name: { current: string | null; proposed: string | null };
      email: { current: string | null; proposed: string | null };
      phone: { current: string | null; proposed: string | null };
    };
  } | null;
  messageId: string | null;
}

export type ConversationEventApplyPayload =
  | {
      operation: 'create_or_link';
      guest: {
        mode: 'linked' | 'existing' | 'create';
        guestId?: string;
        name?: string;
        email?: string;
        phone?: string;
        language?: 'en' | 'de';
        applyUpdates?: {
          name?: boolean;
          email?: boolean;
          phone?: boolean;
        };
      };
      event:
        | { mode: 'existing'; eventId: string }
        | {
            mode: 'create';
            type: 'puppy_yoga' | 'beach_walk' | 'coffee_cake_cuddles' | 'retreat';
            title: string;
            date: string;
            time: string;
            capacity: number;
            location?: string | null;
            description?: string | null;
          };
      registration: {
        externalBookingId: string;
        externalProductCode?: string | null;
        attendeeCount?: number;
      };
    }
  | {
      operation: 'cancel';
      externalBookingId: string;
    }
  | {
      operation: 'move';
      externalBookingId: string;
      targetEvent:
        | { mode: 'existing'; eventId: string }
        | {
            mode: 'create';
            type: 'puppy_yoga' | 'beach_walk' | 'coffee_cake_cuddles' | 'retreat';
            title: string;
            date: string;
            time: string;
            capacity: number;
            location?: string | null;
            description?: string | null;
          };
    };

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

export function useConversationEventAnalysis(conversationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conversations.eventAnalysis(conversationId ?? ''),
    queryFn: async () => {
      const response = await api.get<{ data: ConversationEventAnalysis }>(
        `/api/v1/conversations/${conversationId}/event-analysis`
      );
      return response.data;
    },
    enabled: !!conversationId,
    refetchInterval: 10_000,
  });
}

export function useRunConversationEventAnalysis(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post<{ data: ConversationEventAnalysis }>(
        `/api/v1/conversations/${conversationId}/event-analysis`
      );
      return response.data;
    },
    onSuccess: () => {
      if (!conversationId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.eventAnalysis(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
    },
  });
}

export function useApplyConversationEventAction(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ConversationEventApplyPayload) => {
      const response = await api.post<{
        data: {
          conversation: Conversation;
          guest: { id: string; name: string; email: string | null } | null;
          event: { id: string } | null;
          registration: { id: string; eventId: string; externalBookingId: string | null } | null;
        };
      }>(
        `/api/v1/conversations/${conversationId}/events`,
        payload
      );
      return response.data;
    },
    onSuccess: (_data, payload) => {
      if (!conversationId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.detail(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.eventAnalysis(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.guests.all });
      if (payload.operation === 'move' || payload.operation === 'create_or_link') {
        const eventId = payload.operation === 'move'
          ? (payload.targetEvent.mode === 'existing' ? payload.targetEvent.eventId : undefined)
          : (payload.event.mode === 'existing' ? payload.event.eventId : undefined);
        if (eventId) {
          queryClient.invalidateQueries({ queryKey: queryKeys.events.detail(eventId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.events.registrations(eventId) });
        }
      }
    },
  });
}
