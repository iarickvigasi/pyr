import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: string };
    user: { sub: string; role: string };
  }
}

export default fp(async function authPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifyJwt, {
    secret: fastify.config.JWT_SECRET,
  });

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    // Check API key first (for AI assistant)
    const apiKey = request.headers['x-api-key'];
    if (apiKey === fastify.config.API_KEY) {
      request.user = { sub: 'api-key', role: 'assistant' };
      return;
    }

    // Fall back to JWT (for dashboard)
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or missing authentication',
        },
      });
    }
  });
});
