import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import { GatewayWsClient } from './gateway-ws-client.js';
import type { FastifyBaseLogger } from 'fastify';

// ─── Test helpers ─────────────────────────────────────────

function createTestServer(): Promise<{ server: WebSocketServer; port: number; url: string }> {
  return new Promise((resolve) => {
    const server = new WebSocketServer({ port: 0 });
    server.on('listening', () => {
      const addr = server.address() as { port: number };
      resolve({ server, port: addr.port, url: `ws://localhost:${addr.port}` });
    });
  });
}

function handleHandshake(ws: WsWebSocket): void {
  // Send connect.challenge
  ws.send(JSON.stringify({ type: 'event', event: 'connect.challenge', payload: {} }));

  ws.on('message', (data) => {
    const frame = JSON.parse(data.toString());
    if (frame.type === 'req' && frame.method === 'connect') {
      ws.send(JSON.stringify({
        type: 'res',
        id: frame.id,
        ok: true,
        payload: { type: 'hello-ok', protocol: 3, policy: { tickIntervalMs: 15000 } },
      }));
    }
  });
}

function makeLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'info',
    silent: vi.fn(),
  } as unknown as FastifyBaseLogger;
}

// ─── Tests ────────────────────────────────────────────────

describe('GatewayWsClient', () => {
  let server: WebSocketServer;
  let client: GatewayWsClient;
  let port: number;

  beforeEach(async () => {
    const setup = await createTestServer();
    server = setup.server;
    port = setup.port;
  });

  afterEach(async () => {
    if (client) {
      await client.stop();
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('connects and completes handshake', async () => {
    server.on('connection', (ws) => {
      handleHandshake(ws);
    });

    client = new GatewayWsClient(
      { url: `ws://localhost:${port}`, token: 'test-token', requestTimeoutMs: 2000, reconnectMs: 200 },
      makeLogger(),
    );

    await client.start();

    // Give a small delay for the handshake to complete
    await new Promise((r) => setTimeout(r, 100));

    expect(client.isConnected).toBe(true);
  });

  it('sends RPC request and receives response', async () => {
    server.on('connection', (ws) => {
      handleHandshake(ws);

      ws.on('message', (data) => {
        const frame = JSON.parse(data.toString());
        if (frame.type === 'req' && frame.method === 'agent') {
          ws.send(JSON.stringify({
            type: 'res',
            id: frame.id,
            ok: true,
            payload: { data: 'test-response' },
          }));
        }
      });
    });

    client = new GatewayWsClient(
      { url: `ws://localhost:${port}`, token: 'test-token', requestTimeoutMs: 2000, reconnectMs: 200 },
      makeLogger(),
    );

    await client.start();
    await new Promise((r) => setTimeout(r, 100));

    const result = await client.request<{ data: string }>('agent', { message: 'hello' });
    expect(result).toEqual({ data: 'test-response' });
  });

  it('rejects request on timeout', async () => {
    server.on('connection', (ws) => {
      handleHandshake(ws);
      // Intentionally do NOT respond to the agent request
    });

    client = new GatewayWsClient(
      { url: `ws://localhost:${port}`, token: 'test-token', requestTimeoutMs: 500, reconnectMs: 200 },
      makeLogger(),
    );

    await client.start();
    await new Promise((r) => setTimeout(r, 100));

    await expect(
      client.request('agent', { message: 'hello' }),
    ).rejects.toThrow('Gateway RPC timeout: agent');
  });

  it('routes chat events to listeners', async () => {
    server.on('connection', (ws) => {
      handleHandshake(ws);

      // After handshake, send a chat event
      ws.on('message', (data) => {
        const frame = JSON.parse(data.toString());
        if (frame.type === 'req' && frame.method === 'connect') {
          // Handshake response already handled above, but wait for it to resolve
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: 'event',
              event: 'chat',
              payload: {
                runId: 'run-1',
                sessionKey: 'test-session',
                seq: 1,
                state: 'delta',
                message: { content: 'hello from gateway' },
              },
            }));
          }, 50);
        }
      });
    });

    client = new GatewayWsClient(
      { url: `ws://localhost:${port}`, token: 'test-token', requestTimeoutMs: 2000, reconnectMs: 200 },
      makeLogger(),
    );

    const receivedEvents: unknown[] = [];
    client.onChatEvent((evt) => {
      receivedEvents.push(evt);
    });

    await client.start();
    await new Promise((r) => setTimeout(r, 300));

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0]).toEqual(
      expect.objectContaining({
        sessionKey: 'test-session',
        state: 'delta',
        message: { content: 'hello from gateway' },
      }),
    );
  });

  it('unsubscribe removes chat event listener', async () => {
    server.on('connection', (ws) => {
      handleHandshake(ws);

      ws.on('message', (data) => {
        const frame = JSON.parse(data.toString());
        if (frame.type === 'req' && frame.method === 'connect') {
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: 'event',
              event: 'chat',
              payload: {
                runId: 'run-1',
                sessionKey: 'test-session',
                seq: 1,
                state: 'delta',
                message: { content: 'should not arrive' },
              },
            }));
          }, 50);
        }
      });
    });

    client = new GatewayWsClient(
      { url: `ws://localhost:${port}`, token: 'test-token', requestTimeoutMs: 2000, reconnectMs: 200 },
      makeLogger(),
    );

    const receivedEvents: unknown[] = [];
    const unsub = client.onChatEvent((evt) => {
      receivedEvents.push(evt);
    });

    // Unsubscribe before the event arrives
    unsub();

    await client.start();
    await new Promise((r) => setTimeout(r, 300));

    expect(receivedEvents.length).toBe(0);
  });

  it('rejects pending requests on disconnect', async () => {
    let serverWs: WsWebSocket | null = null;

    server.on('connection', (ws) => {
      serverWs = ws;
      handleHandshake(ws);
      // Do NOT respond to agent requests -- just close the connection
    });

    client = new GatewayWsClient(
      { url: `ws://localhost:${port}`, token: 'test-token', requestTimeoutMs: 5000, reconnectMs: 200 },
      makeLogger(),
    );

    await client.start();
    await new Promise((r) => setTimeout(r, 100));

    // Start a request, then close the server connection
    const requestPromise = client.request('agent', { message: 'hello' });

    // Close the server-side connection after a tiny delay
    setTimeout(() => {
      serverWs?.close();
    }, 50);

    await expect(requestPromise).rejects.toThrow('Gateway connection lost');
  });

  it('stop() closes connection cleanly', async () => {
    server.on('connection', (ws) => {
      handleHandshake(ws);
    });

    client = new GatewayWsClient(
      { url: `ws://localhost:${port}`, token: 'test-token', requestTimeoutMs: 2000, reconnectMs: 200 },
      makeLogger(),
    );

    await client.start();
    await new Promise((r) => setTimeout(r, 100));
    expect(client.isConnected).toBe(true);

    await client.stop();
    expect(client.isConnected).toBe(false);
  });

  it('reconnects after connection drop', async () => {
    let connectionCount = 0;

    server.on('connection', (ws) => {
      connectionCount++;
      handleHandshake(ws);

      // Close the first connection after handshake to trigger reconnect
      if (connectionCount === 1) {
        setTimeout(() => {
          ws.close();
        }, 100);
      }
    });

    client = new GatewayWsClient(
      { url: `ws://localhost:${port}`, token: 'test-token', requestTimeoutMs: 2000, reconnectMs: 200 },
      makeLogger(),
    );

    await client.start();
    await new Promise((r) => setTimeout(r, 100));
    expect(client.isConnected).toBe(true);

    // Wait for disconnect + reconnect (200ms backoff + connection time)
    await new Promise((r) => setTimeout(r, 1000));

    expect(connectionCount).toBeGreaterThanOrEqual(2);
    expect(client.isConnected).toBe(true);
  });
});
