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

function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const chunks = cookieHeader.split(';');
  for (const chunk of chunks) {
    const [rawKey, ...rest] = chunk.split('=');
    const key = rawKey?.trim();
    if (key !== name) continue;
    const rawValue = rest.join('=').trim();
    if (!rawValue) return null;
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }
  return null;
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

    // Primary JWT auth via Authorization header.
    const authorization = request.headers.authorization;
    if (authorization) {
      try {
        await request.jwtVerify();
        return;
      } catch {
        // Fall through to cookie-token fallback.
      }
    }

    // Fallback for iframe/dashboard routes that cannot attach Bearer headers.
    const tokenFromCookie = getCookieValue(request.headers.cookie, 'token');
    if (tokenFromCookie) {
      try {
        const decoded = fastify.jwt.verify<{ sub: string; role: string }>(tokenFromCookie);
        request.user = { sub: decoded.sub, role: decoded.role };
        return;
      } catch {
        // Fall through to 401 response below.
      }
    }

    return reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing authentication',
      },
    });
  });
});
