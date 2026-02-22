import { z } from 'zod';

export const chatRequestSchema = z.object({
  message: z.string().min(1).max(10000),
  sessionKey: z.string().min(1),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const resetResponseSchema = z.object({
  data: z.object({
    sessionKey: z.string(),
  }),
});
