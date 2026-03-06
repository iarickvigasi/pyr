import { z } from 'zod';

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export type IdParam = z.infer<typeof idParamSchema>;

export * from './inbox.js';
