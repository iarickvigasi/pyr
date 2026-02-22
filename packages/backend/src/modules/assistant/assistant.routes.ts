/**
 * Assistant routes -- SSE streaming proxy to OpenClaw Gateway and session management.
 *
 * POST /chat   -- Proxy a user message to OpenClaw and stream the SSE response
 * POST /chat/reset -- Generate a new session key for a fresh conversation
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { chatRequestSchema, resetResponseSchema } from './assistant.schema.js';

export default async function assistantRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.addHook('onRequest', app.authenticate);

  // POST /chat -- SSE streaming proxy to OpenClaw Gateway
  server.post('/chat', {
    schema: {
      tags: ['Assistant'],
      summary: 'Send a message to the AI assistant (streaming SSE response)',
      body: chatRequestSchema,
    },
  }, async (request, reply) => {
    const { message, sessionKey } = request.body as { message: string; sessionKey: string };
    const config = app.config;

    // Set a generous timeout for long assistant responses with tool calls
    if (typeof request.raw.setTimeout === 'function') {
      request.raw.setTimeout(120_000);
    }

    let response: Response;
    try {
      response = await fetch(
        `${config.OPENCLAW_GATEWAY_URL}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.OPENCLAW_GATEWAY_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'openclaw:main',
            messages: [{ role: 'user', content: message }],
            stream: true,
            user: sessionKey,
          }),
        },
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      app.log.error({ err }, 'Failed to connect to OpenClaw Gateway');
      return reply.code(502).send({
        error: { code: 'OPENCLAW_ERROR', message: `Gateway connection failed: ${errMsg}` },
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      app.log.error({ status: response.status, body }, 'OpenClaw Gateway returned error');
      return reply.code(502).send({
        error: {
          code: 'OPENCLAW_ERROR',
          message: `Gateway error: ${response.status}`,
          details: body,
        },
      });
    }

    // Hijack the reply so Fastify doesn't try to serialize the response
    reply.hijack();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    if (!response.body) {
      reply.raw.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      app.log.error({ err }, 'Error streaming from OpenClaw Gateway');
    } finally {
      reply.raw.end();
    }
  });

  // POST /chat/reset -- Generate a new session key (new conversation)
  server.post('/chat/reset', {
    schema: {
      tags: ['Assistant'],
      summary: 'Reset the chat session (new conversation)',
      response: { 200: resetResponseSchema },
    },
  }, async (_request, reply) => {
    const newSessionKey = `dashboard:${Date.now()}`;
    return reply.send({ data: { sessionKey: newSessionKey } });
  });
}
