/**
 * Assistant routes -- HTTP proxy to OpenClaw gateway's OpenAI-compatible API.
 *
 * POST /chat       -- Proxy message to gateway /v1/chat/completions (streaming SSE)
 * POST /chat/reset -- Generate a new session key for a fresh conversation
 */
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { chatRequestSchema, resetResponseSchema } from './assistant.schema.js';
import { toolActivityBus, type ToolCallEvent } from '../../lib/tool-activity.js';

/** Path to the agent's soul/identity file relative to project root */
const SOUL_PATH = resolve(import.meta.dirname, '../../../../../openclaw/workspace/SOUL.md');

/**
 * Load the agent system prompt from SOUL.md at startup.
 * Falls back to a minimal prompt if the file is missing.
 */
async function loadSystemPrompt(log: FastifyInstance['log']): Promise<string> {
  try {
    const content = await readFile(SOUL_PATH, 'utf-8');
    log.info({ path: SOUL_PATH }, 'Loaded agent system prompt from SOUL.md');
    return content;
  } catch {
    log.warn({ path: SOUL_PATH }, 'SOUL.md not found, using minimal system prompt');
    return [
      'You are Koda, the Puppy Yoga Retreat business assistant.',
      'You help Ines Brendel manage her wellness retreat in Peyia, Cyprus.',
      'Be casual and friendly. Auto-detect language (English/German).',
      'All write actions require confirmation before executing.',
    ].join('\n');
  }
}

export default async function assistantRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const systemPrompt = await loadSystemPrompt(app.log);

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
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
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

    // Subscribe to tool activity events from the tool-activity plugin.
    // When the OpenClaw plugin calls backend API endpoints (X-API-Key auth),
    // those are detected and emitted here as synthetic SSE tool_calls chunks.
    // This gives the frontend real-time "Searching guests..." indicators.
    const unsubscribe = toolActivityBus.onToolCall((event: ToolCallEvent) => {
      if (reply.raw.writableEnded) return;
      const chunk = {
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{ function: { name: event.toolName } }],
          },
        }],
      };
      reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
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
      unsubscribe();
      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
    }
  });

  // POST /chat/reset -- Acknowledge session reset (new conversation)
  // Session key management is now handled client-side via counter-based keys.
  // This endpoint is kept for any server-side cleanup needed in the future.
  // Note: no body schema -- this endpoint takes no input. Clients must NOT send
  // Content-Type: application/json with an empty body (Fastify's JSON parser rejects it).
  server.post('/chat/reset', {
    schema: {
      tags: ['Assistant'],
      summary: 'Reset the chat session (new conversation)',
      response: { 200: resetResponseSchema },
    },
  }, async (_request, reply) => {
    // Session key management moved to frontend (counter-based).
    // This endpoint is kept for backward compatibility and future server-side cleanup.
    return reply.send({ data: { sessionKey: 'client-managed' } });
  });
}
