import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Faq {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

const faqKeys = {
  all: ['faqs'] as const,
  list: (tag?: string) => ['faqs', 'list', { tag }] as const,
};

export function useFaqs(tag?: string) {
  return useQuery({
    queryKey: faqKeys.list(tag),
    queryFn: async () => {
      const params = tag ? { tag } : undefined;
      const response = await api.get<{ data: Faq[] }>('/api/v1/faqs', { params });
      return response.data;
    },
  });
}

export function useCreateFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { question: string; answer: string; tags?: string[] }) => {
      const response = await api.post<{ data: Faq }>('/api/v1/faqs', data);
      return response.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: faqKeys.all });
    },
  });
}

export function useUpdateFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; question?: string; answer?: string; tags?: string[] }) => {
      const response = await api.patch<{ data: Faq }>(`/api/v1/faqs/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: faqKeys.all });
    },
  });
}

export function useDeleteFaq() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/faqs/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: faqKeys.all });
    },
  });
}
