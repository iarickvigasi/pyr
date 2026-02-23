import 'zod-openapi/extend';
import { z } from 'zod';

export const chatRequestSchema = z.object({
  message: z.string().min(1).max(10000).openapi({ example: 'Who is checking in tomorrow?' }),
  sessionKey: z.string().min(1).openapi({ example: 'dashboard:1714000000000' }),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const resetResponseSchema = z.object({
  data: z.object({
    sessionKey: z.string(),
  }),
});
