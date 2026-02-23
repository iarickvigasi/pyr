import 'zod-openapi/extend';
import { z } from 'zod';

// ─── Request Schemas ────────────────────────────────────

export const createFaqSchema = z.object({
  question: z.string().min(1).max(500).openapi({ example: 'What is included in the 7-day retreat package?' }),
  answer: z.string().min(1).max(5000).openapi({ example: 'The 7-day retreat includes accommodation, daily yoga sessions, vegetarian meals, puppy interaction time, and a beach excursion.' }),
  tags: z
    .array(z.string().max(50))
    .max(10)
    .default([])
    .openapi({ example: ['pricing', 'accommodation'] }),
});

export const updateFaqSchema = z
  .object({
    question: z.string().min(1).max(500).optional().openapi({ example: 'What meals are included in the retreat?' }),
    answer: z.string().min(1).max(5000).optional().openapi({ example: 'All meals are vegetarian and freshly prepared. We accommodate vegan and gluten-free diets.' }),
    tags: z
      .array(z.string().max(50))
      .max(10)
      .optional()
      .openapi({ example: ['meals', 'dietary'] }),
  })
  .refine(
    (data) => data.question !== undefined || data.answer !== undefined || data.tags !== undefined,
    { message: 'At least one field must be provided' },
  );

export const listFaqsQuerySchema = z.object({
  tag: z.string().optional().openapi({ example: 'pricing' }),
});

export const faqIdParamSchema = z.object({
  id: z.string().openapi({ example: 'cm4x7abc00050' }),
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
