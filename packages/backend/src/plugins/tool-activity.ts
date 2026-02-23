/**
 * Tool activity detection plugin.
 *
 * Detects when the OpenClaw plugin calls the backend API (X-API-Key auth)
 * and emits tool-call events so the assistant chat SSE stream can show
 * real-time tool activity indicators to the frontend.
 */
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { toolActivityBus, inferToolName } from '../lib/tool-activity.js';

export default fp(async function toolActivityPlugin(fastify: FastifyInstance) {
  fastify.addHook('preHandler', (request, _reply, done) => {
    // Only trigger for API-key authenticated requests (from the OpenClaw plugin)
    const apiKey = request.headers['x-api-key'];
    if (!apiKey || apiKey !== fastify.config.API_KEY) {
      done();
      return;
    }

    const toolName = inferToolName(request.method, request.url);
    if (toolName) {
      toolActivityBus.emitToolCall(toolName);
    }

    done();
  });
});
