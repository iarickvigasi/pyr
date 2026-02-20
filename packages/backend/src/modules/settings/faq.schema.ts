import { z } from 'zod';

// ─── Request Schemas ────────────────────────────────────

export const createFaqSchema = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(5000),
  tags: z
    .array(z.string().max(50))
    .max(10)
    .default([]),
});

export const updateFaqSchema = z
  .object({
    question: z.string().min(1).max(500).optional(),
    answer: z.string().min(1).max(5000).optional(),
    tags: z
      .array(z.string().max(50))
      .max(10)
      .optional(),
  })
  .refine(
    (data) => data.question !== undefined || data.answer !== undefined || data.tags !== undefined,
    { message: 'At least one field must be provided' },
  );

export const listFaqsQuerySchema = z.object({
  tag: z.string().optional(),
});

export const faqIdParamSchema = z.object({
  id: z.string(),
});

// ─── Response Schemas ───────────────────────────────────

const faqItemSchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  tags: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const faqResponseSchema = z.object({
  data: faqItemSchema,
});

export const faqListResponseSchema = z.object({
  data: z.array(faqItemSchema),
});

// ─── Types ──────────────────────────────────────────────

export type CreateFaqBody = z.infer<typeof createFaqSchema>;
export type UpdateFaqBody = z.infer<typeof updateFaqSchema>;
export type ListFaqsQuery = z.infer<typeof listFaqsQuerySchema>;
