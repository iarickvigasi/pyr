import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { GatewayWsClient } from '../services/gateway/gateway-ws-client.js';

declare module 'fastify' {
  interface FastifyInstance {
    gateway: GatewayWsClient;
  }
}

export default fp(async function gatewayPlugin(fastify: FastifyInstance) {
  const client = new GatewayWsClient(
    {
      url: fastify.config.OPENCLAW_GATEWAY_WS_URL,
      token: fastify.config.OPENCLAW_GATEWAY_TOKEN,
    },
    fastify.log,
  );

  // Non-blocking startup: gateway may not be ready when backend starts.
  // The client's reconnection logic handles delayed availability.
  client.start().catch((err) => {
    fastify.log.error({ err }, 'Gateway WebSocket initial connection failed (will retry)');
  });

  fastify.log.info('Gateway WebSocket connection initiated');

  fastify.decorate('gateway', client);

  fastify.addHook('onClose', async () => {
    await client.stop();
  });
});
