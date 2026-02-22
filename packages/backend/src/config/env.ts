import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  REDIS_URL: z.string().url().startsWith('redis://'),

  JWT_SECRET: z.string().min(32),
  API_KEY: z.string().min(8),

  IMAP_HOST: z.string().default('imap.gmx.net'),
  IMAP_PORT: z.coerce.number().default(993),
  SMTP_HOST: z.string().default('mail.gmx.net'),
  SMTP_PORT: z.coerce.number().default(587),
  EMAIL_USER: z.string().default(''),
  EMAIL_PASS: z.string().default(''),

  ANTHROPIC_API_KEY: z.string().default(''),
  OPENAI_API_KEY: z.string().default(''),
  AI_DEFAULT_MODEL: z.string().default('claude-sonnet-4-5-20250929'),

  CALDAV_URL: z.string().default(''),
  CALDAV_USER: z.string().default(''),
  CALDAV_PASS: z.string().default(''),

  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_ALLOWED_USER_ID: z.string().default(''),

  OPENCLAW_GATEWAY_URL: z.string().default('http://localhost:18789'),
  OPENCLAW_GATEWAY_WS_URL: z.string().default('ws://localhost:18789'),
  OPENCLAW_GATEWAY_TOKEN: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
