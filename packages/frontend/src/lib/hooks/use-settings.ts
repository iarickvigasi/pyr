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

// ─── Email Provider Config Hooks ──────────────────────────

interface EmailProviderConfigResponse {
  data: {
    configured: boolean;
    provider: string | null;
    imapHost: string | null;
    imapPort: number | null;
    smtpHost: string | null;
    smtpPort: number | null;
    email: string | null;
    password: string;
    pollIntervalMinutes: number;
    pollingEnabled: boolean;
    lastPollTime: string | null;
    connectionHealthy: boolean | null;
  };
}

interface TestEmailConnectionResponse {
  data: {
    imap: boolean;
    smtp: boolean;
    error?: string;
  };
}

export function useEmailProviderConfig() {
  return useQuery({
    queryKey: queryKeys.settings.key('email-provider'),
    queryFn: () =>
      api.get<EmailProviderConfigResponse>('/api/v1/settings/email-provider'),
    retry: false,
  });
}

export function useSaveEmailProviderConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: {
      provider: string;
      imapHost: string;
      imapPort: number;
      smtpHost: string;
      smtpPort: number;
      email: string;
      password: string;
      pollIntervalMinutes: number;
      pollingEnabled: boolean;
    }) => api.post<{ data: { saved: boolean } }>('/api/v1/settings/email-provider', config),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.key('email-provider') });
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

export function useTestEmailConnection() {
  return useMutation({
    mutationFn: (params: {
      provider: string;
      imapHost: string;
      imapPort: number;
      smtpHost: string;
      smtpPort: number;
      email: string;
      password: string;
    }) => api.post<TestEmailConnectionResponse>('/api/v1/settings/test-email-connection', params),
  });
}

export function useTogglePolling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { enabled: boolean }) =>
      api.post<{ data: { pollingEnabled: boolean } }>('/api/v1/settings/email-provider/toggle-polling', params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.key('email-provider') });
    },
  });
}
