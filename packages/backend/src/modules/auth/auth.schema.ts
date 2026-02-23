import 'zod-openapi/extend';
import { z } from 'zod';

export const loginBodySchema = z.object({
  email: z.string().email().openapi({ example: 'ines@puppyyogaretreat.com' }),
  password: z.string().min(1).openapi({ example: '********' }),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const loginResponseSchema = z.object({
  data: z.object({
    token: z.string(),
    user: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
    }),
  }),
});

export const meResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
  }),
});
