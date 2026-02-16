import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { loginBodySchema, loginResponseSchema, meResponseSchema } from './auth.schema.js';
import { login, getMe } from './auth.service.js';

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Login with email and password',
      body: loginBodySchema,
      response: { 200: loginResponseSchema },
    },
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' },
    },
  }, async (request, reply) => {
    const { email, password } = request.body;
    const { user } = await login(app.prisma, email, password);
    const token = app.jwt.sign(
      { sub: user.id, role: 'admin' },
      { expiresIn: '24h' },
    );
    return reply.send({ token, user });
  });

  server.get('/me', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Get current authenticated user',
      response: { 200: meResponseSchema },
    },
  }, async (request, reply) => {
    const user = await getMe(app.prisma, request.user.sub);
    return reply.send(user);
  });
}
