import 'zod-openapi/extend';
import { z } from 'zod';

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().openapi({ example: 'NOT_FOUND' }),
    message: z.string().openapi({ example: 'Resource not found' }),
    details: z.unknown().optional(),
  }),
});
