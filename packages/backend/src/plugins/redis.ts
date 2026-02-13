import fp from 'fastify-plugin';
import { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

export default fp(async function redisPlugin(fastify: FastifyInstance) {
  const redis = new Redis(fastify.config.REDIS_URL, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
  });

  redis.on('error', (err: Error) => {
    fastify.log.error({ err }, 'Redis connection error');
  });

  redis.on('connect', () => {
    fastify.log.info('Redis connected');
  });

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    await redis.quit();
    fastify.log.info('Redis disconnected');
  });
});
