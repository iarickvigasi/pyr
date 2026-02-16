import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-client';

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: () =>
      api.get<{
        data: Array<{ key: string; value: unknown }>;
      }>('/api/v1/settings'),
  });
}

export function useSetting(key: string) {
  return useQuery({
    queryKey: queryKeys.settings.key(key),
    queryFn: () =>
      api.get<{
        data: { key: string; value: unknown };
      }>(`/api/v1/settings/${key}`),
    retry: false,
  });
}

export function useUpdateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      api.put(`/api/v1/settings/${key}`, { value }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.key(vars.key) });
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}
