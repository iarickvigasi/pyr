import { z } from 'zod';

// ─── Response Schemas ──────────────────────────────────────

export const syncStatusResponseSchema = z.object({
  data: z.object({
    synced: z.number(),
    pending: z.number(),
    failed: z.number(),
    lastSyncAt: z.string().nullable(),
  }),
});

export const resyncResponseSchema = z.object({
  data: z.object({
    jobsEnqueued: z.number(),
  }),
});

export const caldavConfigResponseSchema = z.object({
  data: z.object({
    configured: z.boolean(),
    serverUrl: z.string().nullable(),
    username: z.string().nullable(),
    calendarName: z.string().nullable(),
    password: z.string(),
  }),
});

export const caldavConfigBodySchema = z.object({
  serverUrl: z.string().url().default('https://caldav.icloud.com'),
  username: z.string().min(1),
  password: z.string().min(1),
  calendarName: z.string().default('Puppy Yoga Retreat'),
});

export const caldavConfigSavedResponseSchema = z.object({
  data: z.object({
    saved: z.boolean(),
  }),
});

export const testCaldavConnectionResponseSchema = z.object({
  data: z.object({
    success: z.boolean(),
    calendarName: z.string().optional(),
    error: z.string().optional(),
  }),
});
