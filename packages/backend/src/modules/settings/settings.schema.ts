import { z } from 'zod';

export const settingKeyParamSchema = z.object({
  key: z.string().min(1),
});

export const upsertSettingBodySchema = z.object({
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
