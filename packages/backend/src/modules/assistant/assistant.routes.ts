/**
 * Assistant routes -- HTTP proxy to OpenClaw gateway's OpenAI-compatible API.
 *
 * POST /chat       -- Proxy message to gateway /v1/chat/completions (streaming SSE)
 * POST /chat/reset -- Generate a new session key for a fresh conversation
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { chatRequestSchema, resetResponseSchema } from './assistant.schema.js';

export default async function assistantRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.addHook('onRequest', app.authenticate);

  // POST /chat -- Proxy to gateway HTTP API with streaming SSE
  server.post('/chat', {
    schema: {
      tags: ['Assistant'],
      summary: 'Send a message to the AI assistant (streaming SSE response)',
      body: chatRequestSchema,
    },
  }, async (request, reply) => {
    const { message, sessionKey } = request.body as { message: string; sessionKey: string };

    const gatewayUrl = `${app.config.OPENCLAW_GATEWAY_URL}/v1/chat/completions`;

    // Set a generous timeout for long assistant responses with tool calls
    if (typeof request.raw.setTimeout === 'function') {
      request.raw.setTimeout(120_000);
    }

    // Call the gateway's OpenAI-compatible HTTP API
    let gatewayResponse: Response;
    try {
      gatewayResponse = await fetch(gatewayUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${app.config.OPENCLAW_GATEWAY_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4-5-20250929',
          messages: [{ role: 'user', content: message }],
          stream: true,
          user: sessionKey,
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      app.log.error({ err }, 'Gateway HTTP request failed');
      return reply.code(502).send({
        error: { code: 'GATEWAY_ERROR', message: 'Failed to connect to AI gateway' },
      });
    }

    if (!gatewayResponse.ok) {
      const errBody = await gatewayResponse.text().catch(() => '');
      app.log.error({ status: gatewayResponse.status, body: errBody }, 'Gateway returned error');
      return reply.code(502).send({
        error: { code: 'GATEWAY_ERROR', message: `AI gateway returned ${gatewayResponse.status}` },
      });
    }

    if (!gatewayResponse.body) {
      return reply.code(502).send({
        error: { code: 'GATEWAY_ERROR', message: 'AI gateway returned no response body' },
      });
    }

    // Hijack the reply and pipe the gateway's SSE stream directly to the client.
    // The gateway produces OpenAI-format SSE (choices[0].delta.content, data: [DONE])
    // which is exactly what the frontend expects — no transformation needed.
    reply.hijack();

    const origin = request.headers.origin ?? app.config.CORS_ORIGIN;
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    });

    const reader = gatewayResponse.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(value);
      }
    } catch (err) {
      app.log.error({ err }, 'Error streaming gateway response');
    } finally {
      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
    }
  });

  // POST /chat/reset -- Generate a new session key (new conversation)
  // Note: no body schema -- this endpoint takes no input. Clients must NOT send
  // Content-Type: application/json with an empty body (Fastify's JSON parser rejects it).
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
