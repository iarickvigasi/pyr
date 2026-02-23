import 'zod-openapi/extend';
import { z } from 'zod';

export const settingKeyParamSchema = z.object({
  key: z.string().min(1).openapi({ example: 'briefing_time' }),
});

export const upsertSettingBodySchema = z.object({
  value: z.unknown().openapi({ example: '07:30' }),
});

export const upsertSettingByKeyBodySchema = z.object({
  key: z.string().min(1).openapi({ example: 'business_name' }),
  value: z.unknown().openapi({ example: 'Puppy Yoga Retreat' }),
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
  provider: z.string().openapi({ example: 'gmx' }),
  imapHost: z.string().openapi({ example: 'imap.gmx.net' }),
  imapPort: z.number().openapi({ example: 993 }),
  smtpHost: z.string().openapi({ example: 'mail.gmx.net' }),
  smtpPort: z.number().openapi({ example: 587 }),
  email: z.string().email().openapi({ example: 'puppyyogaretreat@gmx.de' }),
  password: z.string().openapi({ example: '********' }),
});

export const testEmailConnectionResponseSchema = z.object({
  data: z.object({
    imap: z.boolean(),
    smtp: z.boolean(),
    error: z.string().optional(),
  }),
});

export const emailProviderConfigBodySchema = z.object({
  provider: z.enum(['gmx', 'gmail', 'outlook', 'custom']).openapi({ example: 'gmx' }),
  imapHost: z.string().openapi({ example: 'imap.gmx.net' }),
  imapPort: z.number().openapi({ example: 993 }),
  smtpHost: z.string().openapi({ example: 'mail.gmx.net' }),
  smtpPort: z.number().openapi({ example: 587 }),
  email: z.string().email().openapi({ example: 'puppyyogaretreat@gmx.de' }),
  password: z.string().openapi({ example: '********' }),
  pollIntervalMinutes: z.number().min(1).max(60).default(2).openapi({ example: 2 }),
  pollingEnabled: z.boolean().default(true).openapi({ example: true }),
});

export const togglePollingBodySchema = z.object({
  enabled: z.boolean().openapi({ example: true }),
});
