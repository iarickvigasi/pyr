import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { env, type Env } from './config/env.js';
import { errorHandler } from './lib/error-handler.js';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import redisPlugin from './plugins/redis.js';
import swaggerPlugin from './plugins/swagger.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Env;
  }
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' && {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true },
        },
      }),
    },
  });

  // Zod type provider
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Config decorator
  app.decorate('config', env);

  // Error handler
  app.setErrorHandler(errorHandler);

  // CORS
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Infrastructure plugins
  await app.register(swaggerPlugin);
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(authPlugin);

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // API routes will be registered here in later epics
  // await app.register(guestRoutes, { prefix: '/api/v1/guests' });

  return app;
}
