import { PrismaClient } from '@prisma/client';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export default fp(async function prismaPlugin(fastify: FastifyInstance) {
  const prisma = new PrismaClient({
    log:
      fastify.config.NODE_ENV === 'development'
        ? [{ emit: 'event', level: 'query' }]
        : [],
  });

  await prisma.$connect();
  fastify.log.info('Prisma connected to database');

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
    fastify.log.info('Prisma disconnected');
  });
});
