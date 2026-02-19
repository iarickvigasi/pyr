import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
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
import queuePlugin from './plugins/queue.js';
import { registerQueues } from './services/queue/queue.js';
import { registerWorkers, setupSchedulers } from './services/queue/worker.js';
import authRoutes from './modules/auth/auth.routes.js';
import guestRoutes from './modules/guests/guest.routes.js';
import roomRoutes from './modules/rooms/room.routes.js';
import bookingRoutes from './modules/bookings/booking.routes.js';
import eventRoutes from './modules/events/event.routes.js';
import inboxRoutes from './modules/inbox/inbox.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import settingsRoutes from './modules/settings/settings.routes.js';

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

  // Security headers
  await app.register(helmet, { contentSecurityPolicy: false });

  // CORS
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  });

  // Rate limiting (disabled in test to avoid cross-test interference)
  if (env.NODE_ENV !== 'test') {
    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
    });
  }

  // Infrastructure plugins
  await app.register(swaggerPlugin);
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(authPlugin);

  // Queue infrastructure (requires redis + auth plugins)
  if (env.NODE_ENV !== 'test') {
    await app.register(queuePlugin);
  }

  // Health check — verifies DB and Redis connectivity
  app.get('/health', async (_request, reply) => {
    const checks: Record<string, string> = {};

    try {
      await app.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    try {
      await app.redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }

    const healthy = Object.values(checks).every((v) => v === 'ok');
    const httpStatus = healthy ? 200 : 503;
    return reply.code(httpStatus).send({
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  // API routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(guestRoutes, { prefix: '/api/v1/guests' });
  await app.register(roomRoutes, { prefix: '/api/v1' });
  await app.register(bookingRoutes, { prefix: '/api/v1/bookings' });
  await app.register(eventRoutes, { prefix: '/api/v1/events' });
  await app.register(inboxRoutes, { prefix: '/api/v1/conversations' });
  await app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
  await app.register(settingsRoutes, { prefix: '/api/v1/settings' });

  // Queue setup: register queues, workers, and schedulers (after all plugins + routes)
  if (env.NODE_ENV !== 'test') {
    await registerQueues(app);
    await registerWorkers(app);
    await setupSchedulers(app);
  }

  return app;
}
