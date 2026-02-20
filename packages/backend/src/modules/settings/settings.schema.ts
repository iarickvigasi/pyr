import { z } from 'zod';

export const settingKeyParamSchema = z.object({
  key: z.string().min(1),
});

export const upsertSettingBodySchema = z.object({
  value: z.unknown(),
});

export const upsertSettingByKeyBodySchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

export const settingResponseSchema = z.object({
  data: z.object({
    key: z.string(),
    value: z.unknown(),
  }),
});

export const settingsListResponseSchema = z.object({
  data: z.array(
    z.object({
      key: z.string(),
      value: z.unknown(),
    }),
  ),
});

// ─── Email Provider Config Schemas ──────────────────────────

export const testEmailConnectionBodySchema = z.object({
  provider: z.string(),
  imapHost: z.string(),
  imapPort: z.number(),
  smtpHost: z.string(),
  smtpPort: z.number(),
  email: z.string().email(),
  password: z.string(),
});

export const testEmailConnectionResponseSchema = z.object({
  data: z.object({
    imap: z.boolean(),
    smtp: z.boolean(),
    error: z.string().optional(),
  }),
});

export const emailProviderConfigBodySchema = z.object({
  provider: z.enum(['gmx', 'gmail', 'outlook', 'custom']),
  imapHost: z.string(),
  imapPort: z.number(),
  smtpHost: z.string(),
  smtpPort: z.number(),
  email: z.string().email(),
  password: z.string(),
  pollIntervalMinutes: z.number().min(1).max(60).default(2),
  pollingEnabled: z.boolean().default(true),
});

export const togglePollingBodySchema = z.object({
  enabled: z.boolean(),
});
