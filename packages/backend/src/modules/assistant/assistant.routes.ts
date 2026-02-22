/**
 * Assistant routes -- WebSocket-backed SSE streaming and session management.
 *
 * POST /chat   -- Send a message via WebSocket chat.send and bridge events to SSE
 * POST /chat/reset -- Generate a new session key for a fresh conversation
 */
import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ChatEvent } from '../../services/gateway/types.js';
import { chatRequestSchema, resetResponseSchema } from './assistant.schema.js';

/**
 * Transform a ChatEvent delta into an OpenAI-compatible SSE chunk.
 * The frontend (use-assistant.ts) parses choices[0].delta.content
 * and choices[0].delta.tool_calls -- this format MUST be preserved.
 */
function chatEventToSseChunk(event: ChatEvent): string {
  const msg = event.message;
  // Normalise: if message is a string, wrap it; if object, use as-is
  const delta: Record<string, unknown> = {};

  if (typeof msg === 'string') {
    delta.content = msg;
  } else if (msg && typeof msg === 'object') {
    const msgObj = msg as Record<string, unknown>;
    if ('content' in msgObj) delta.content = msgObj.content;
    if ('tool_calls' in msgObj) delta.tool_calls = msgObj.tool_calls;
  }

  const chunk = { choices: [{ delta }] };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

export default async function assistantRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.addHook('onRequest', app.authenticate);

  // POST /chat -- WebSocket chat.send with SSE bridge
  server.post('/chat', {
    schema: {
      tags: ['Assistant'],
      summary: 'Send a message to the AI assistant (streaming SSE response)',
      body: chatRequestSchema,
    },
  }, async (request, reply) => {
    const { message, sessionKey } = request.body as { message: string; sessionKey: string };

    // Verify gateway is connected before proceeding
    if (!app.gateway.isConnected) {
      return reply.code(502).send({
        error: { code: 'GATEWAY_DISCONNECTED', message: 'Gateway WebSocket not connected' },
      });
    }

    // Set a generous timeout for long assistant responses with tool calls
    if (typeof request.raw.setTimeout === 'function') {
      request.raw.setTimeout(120_000);
    }

    // Hijack the reply so Fastify doesn't try to serialize the response
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

    // Subscribe to chat events BEFORE sending the request
    // so we don't miss any early deltas.
    const unsubscribe = app.gateway.onChatEvent((event: ChatEvent) => {
      if (event.sessionKey !== sessionKey) return;

      if (event.state === 'delta' && event.message != null) {
        reply.raw.write(chatEventToSseChunk(event));
        return;
      }

      if (event.state === 'final' || event.state === 'error' || event.state === 'aborted') {
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
        unsubscribe();
      }
    });

    try {
      await app.gateway.request('chat.send', {
        sessionKey,
        message,
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (err) {
      app.log.error({ err }, 'Gateway chat.send RPC failed');
      unsubscribe();
      // If the response hasn't ended yet, close it gracefully
      if (!reply.raw.writableEnded) {
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
      }
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
