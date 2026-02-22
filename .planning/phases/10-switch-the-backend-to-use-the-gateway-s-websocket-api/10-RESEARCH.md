# Phase 10: Switch the Backend to Use the Gateway's WebSocket API - Research

**Researched:** 2026-02-22
**Domain:** OpenClaw Gateway WebSocket protocol, backend integration architecture
**Confidence:** MEDIUM

## Summary

The PYR backend currently communicates with the OpenClaw Gateway via three HTTP integration points: (1) the `/v1/chat/completions` endpoint for AI draft generation and dashboard chat streaming, (2) the `/hooks/<path>` webhook endpoint for proactive notifications (briefings, alerts), and (3) the `/v1/chat/completions` health check call. Phase 10 replaces all three HTTP patterns with a single persistent WebSocket connection using the Gateway's native RPC protocol (protocol version 3).

The OpenClaw Gateway exposes a JSON-RPC-over-WebSocket protocol as its primary control plane. The HTTP endpoints (`/v1/chat/completions`, `/hooks/*`) are secondary compatibility layers -- the Gateway's native protocol is WebSocket. The `openclaw` npm package exports a `GatewayClient` class at `openclaw/plugin-sdk` path that handles connection lifecycle, handshake, reconnection, and typed RPC calls. However, this class is designed for plugin-internal use, and using it from an external backend service is an atypical (but documented) pattern. The alternative is to implement a lightweight WebSocket client directly against the protocol, which is simpler and avoids coupling to the OpenClaw plugin-sdk's internal module graph.

**Primary recommendation:** Build a thin `GatewayWsClient` service class in the backend that maintains a persistent WebSocket connection (using Node.js 22's native `WebSocket` global), handles the connect handshake, and exposes typed methods for `chat.send`, `chat.history`, `sessions.reset`, and `agent` RPC calls. Replace all three HTTP integration points to use this single connection. Use `ws` npm package (not native `WebSocket`) for server-side use since it provides features needed for production use (per-message deflate, custom headers, ping/pong keep-alive).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ws` | ^8.x | WebSocket client for Node.js | De facto server-side WS library; supports ping/pong, binary frames, per-message deflate. Native `WebSocket` in Node 22 lacks server-side features (no ping/pong control, no custom headers) |
| OpenClaw Gateway Protocol v3 | (bundled with openclaw 2026.2.x) | RPC protocol types | TypeBox schemas exported from `openclaw/plugin-sdk` define all message types |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `crypto` (Node built-in) | -- | UUID generation for RPC request IDs | `crypto.randomUUID()` for idempotency keys and request IDs |
| `events` (Node built-in) | -- | EventEmitter for chat event streaming | Bridge WS events to SSE response in assistant routes |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ws` npm package | Node 22 native `WebSocket` | Native WS lacks ping/pong control, no `on('ping')` handler, no custom headers in handshake. `ws` is battle-tested for server-to-server use. |
| Custom WS client | OpenClaw's `GatewayClient` class from plugin-sdk | GatewayClient has heavy internal deps (device identity, key signing). Using it from backend would require importing openclaw as a dependency in the backend package. Too much coupling. |
| WebSocket for everything | Keep HTTP for webhooks/hooks, only WS for chat | Defeats the purpose -- all communication should go through one channel for connection reuse and simplified architecture |

**Installation:**
```bash
pnpm add ws @types/ws --filter @pyr/backend
```

## Architecture Patterns

### Current Architecture (HTTP)

```
Backend                          OpenClaw Gateway
  |                                    |
  |-- POST /v1/chat/completions ------>|  (dashboard chat, SSE streaming)
  |<-------- SSE stream ---------------|
  |                                    |
  |-- POST /v1/chat/completions ------>|  (AI draft generation, non-streaming)
  |<-------- JSON response ------------|
  |                                    |
  |-- POST /hooks/briefing ----------->|  (morning briefing)
  |-- POST /hooks/alert -------------->|  (new-booking, guest-arriving, etc.)
  |-- POST /hooks/draft -------------->|  (draft-ready notification)
  |<-------- 200 OK -------------------|
```

### Target Architecture (WebSocket)

```
Backend                          OpenClaw Gateway
  |                                    |
  |== WebSocket (persistent) =========>|  (single connection, auto-reconnect)
  |                                    |
  |-- req: chat.send ----------------->|  (dashboard chat)
  |<-- event: chat (delta/final) ------|  (streaming response)
  |                                    |
  |-- req: chat.send ----------------->|  (AI draft generation)
  |<-- event: chat (delta/final) ------|  (accumulate to final content)
  |                                    |
  |-- req: agent --------------------->|  (hook replacement: briefing/alert)
  |<-- res: ok ------------------------|
  |                                    |
  |-- req: sessions.reset ------------>|  (session management)
  |<-- res: ok ------------------------|
```

### Recommended Project Structure

```
packages/backend/src/
├── services/
│   └── gateway/
│       ├── gateway-ws-client.ts     # WebSocket client, connect/handshake, RPC
│       ├── gateway-ws-client.test.ts
│       └── types.ts                 # Typed interfaces for protocol messages
├── plugins/
│   └── gateway.ts                   # Fastify plugin: decorates app.gateway
├── modules/
│   └── assistant/
│       └── assistant.routes.ts      # MODIFIED: uses WS instead of HTTP proxy
├── services/
│   └── ai/
│       ├── draft-generator.ts       # MODIFIED: uses WS instead of HTTP
│       └── index.ts                 # MODIFIED: healthCheck via WS
└── modules/
    └── notifications/
        └── notification.service.ts  # MODIFIED: uses WS agent method instead of HTTP hooks
```

### Pattern 1: Gateway WebSocket Client Singleton

**What:** A Fastify plugin that creates a single `GatewayWsClient` instance at startup, decorates it on the app, and closes it on shutdown.

**When to use:** All OpenClaw communication from the backend.

**Example:**
```typescript
// services/gateway/gateway-ws-client.ts
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import crypto from 'crypto';

export interface GatewayWsClientOptions {
  url: string;          // ws://localhost:18789
  token: string;        // OPENCLAW_GATEWAY_TOKEN
  hookToken?: string;   // OPENCLAW_HOOK_TOKEN (may not be needed with WS)
  reconnectMs?: number; // default 3000
}

export class GatewayWsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: Function; reject: Function; timer: NodeJS.Timeout }>();
  private connected = false;
  private closed = false;

  constructor(private opts: GatewayWsClientOptions) { super(); }

  async start(): Promise<void> { /* connect, handshake, reconnect loop */ }
  async stop(): Promise<void> { /* close WS, flush pending */ }

  /** Send an RPC request and await the response */
  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Gateway RPC timeout: ${method}`));
      }, 120_000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws?.send(JSON.stringify({ type: 'req', id, method, params }));
    });
  }

  /** Subscribe to chat events for a specific runId */
  onChatEvent(handler: (event: ChatEvent) => void): () => void { /* ... */ }

  get isConnected(): boolean { return this.connected; }
}
```

### Pattern 2: Chat Send with Streaming Bridge to SSE

**What:** For dashboard chat, send a `chat.send` RPC request over WebSocket, then bridge `chat` events back to the HTTP SSE response.

**When to use:** Assistant chat endpoint (`POST /api/v1/assistant/chat`).

**Example:**
```typescript
// In assistant.routes.ts -- replace HTTP proxy with WS bridge
server.post('/chat', { /* schema */ }, async (request, reply) => {
  const { message, sessionKey } = request.body;
  const gateway = app.gateway; // decorated GatewayWsClient

  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const idempotencyKey = crypto.randomUUID();

  // Subscribe to chat events before sending
  const unsub = gateway.onChatEvent((evt) => {
    if (evt.sessionKey !== sessionKey) return;

    // Transform native chat event to OpenAI-compatible SSE format
    const sseData = transformToOpenAISse(evt);
    reply.raw.write(`data: ${JSON.stringify(sseData)}\n\n`);

    if (evt.state === 'final' || evt.state === 'error' || evt.state === 'aborted') {
      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
      unsub();
    }
  });

  try {
    await gateway.request('chat.send', {
      sessionKey,
      message,
      idempotencyKey,
    });
  } catch (err) {
    unsub();
    reply.raw.end();
  }
});
```

### Pattern 3: Hook Replacement via Agent RPC

**What:** Replace HTTP webhook calls with `agent` RPC requests over the persistent WebSocket.

**When to use:** Notifications (briefings, alerts, draft-ready).

**Example:**
```typescript
// In notification.service.ts -- replace sendViaHook
export async function sendViaGateway(
  app: FastifyInstance,
  hookPath: string,
  message: string,
): Promise<void> {
  try {
    await app.gateway.request('agent', {
      message,
      agentId: 'main',
      sessionKey: `hook:${hookPath}`,
      deliver: hookPath !== 'draft', // briefing/alert deliver to WhatsApp
      idempotencyKey: crypto.randomUUID(),
    });
    app.log.info({ hookPath }, 'Gateway agent request sent');
  } catch (err) {
    app.log.error({ err, hookPath }, 'Gateway agent request failed');
  }
}
```

### Pattern 4: Non-Streaming Draft Generation via Chat Events

**What:** For AI draft generation, send `chat.send` and accumulate all `delta` events until `final`, then extract the complete response content and usage data.

**When to use:** AI draft generation (replaces HTTP POST to `/v1/chat/completions`).

**Example:**
```typescript
// In draft-generator.ts -- replace HTTP fetch
async function callGatewayChat(
  gateway: GatewayWsClient,
  sessionKey: string,
  messages: { role: string; content: string }[],
): Promise<ChatCompletionResult> {
  return new Promise((resolve, reject) => {
    let content = '';
    let usage: unknown = null;
    let model = 'unknown';

    const unsub = gateway.onChatEvent((evt) => {
      if (evt.sessionKey !== sessionKey) return;

      if (evt.state === 'delta' && evt.message) {
        content += extractDeltaContent(evt.message);
      }
      if (evt.state === 'final') {
        usage = evt.usage;
        model = extractModel(evt);
        unsub();
        resolve({ content, usage, model });
      }
      if (evt.state === 'error') {
        unsub();
        reject(new Error(evt.errorMessage ?? 'Agent error'));
      }
    });

    // Note: chat.send uses a simpler sessionKey-based approach
    // The system prompt must be injected differently (via session context or extraSystemPrompt)
    gateway.request('chat.send', {
      sessionKey,
      message: messages[messages.length - 1].content,
      idempotencyKey: crypto.randomUUID(),
    }).catch((err) => { unsub(); reject(err); });
  });
}
```

### Anti-Patterns to Avoid

- **Opening a new WebSocket per request:** The whole point is a persistent connection. One `GatewayWsClient` instance per backend process.
- **Ignoring reconnection:** WebSocket connections drop. The client MUST auto-reconnect with exponential backoff.
- **Blocking on connect in Fastify startup:** The gateway might not be ready when backend starts. Start WS connection asynchronously, queue requests until connected.
- **Mixing HTTP and WS:** After migration, remove all HTTP calls to the gateway. Don't leave hybrid state.
- **Using native `WebSocket` for server-side:** Node 22's native WebSocket lacks ping/pong, custom headers, and connection management features needed for persistent server-to-server connections.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket reconnection | Custom retry loop | `ws` + reconnection wrapper with exponential backoff | Edge cases: partial frames, half-open connections, backpressure |
| Protocol handshake | Manual frame parsing | Follow OpenClaw protocol v3 spec: challenge -> connect -> hello-ok | Crypto nonce signing for non-local connections |
| SSE formatting | String concatenation | Existing SSE transform (current code already handles this) | Keep the frontend SSE parsing unchanged |
| Request/response correlation | Custom tracking | Map<requestId, Promise> pattern (standard RPC-over-WS pattern) | Timeout handling, cleanup on disconnect |
| Idempotency keys | Sequential counters | `crypto.randomUUID()` | Gateway requires unique idempotency keys per request |

**Key insight:** The hardest part is not the WebSocket connection itself but properly bridging the event-driven WS protocol to the existing request/response patterns used by the backend services. The `chat.send` method returns immediately, and response content arrives asynchronously via `chat` events.

## Common Pitfalls

### Pitfall 1: Chat Event Routing

**What goes wrong:** Multiple simultaneous chat sessions (dashboard user + AI draft generation + hooks) all produce `chat` events on the same WebSocket connection. Without proper filtering by `sessionKey` and `runId`, events get mixed up.

**Why it happens:** Unlike HTTP where each request has its own response stream, all WebSocket events flow through one connection.

**How to avoid:** Route events by `sessionKey` (and optionally `runId`). Maintain a Map of active listeners keyed by sessionKey. The `ChatEvent` type includes `sessionKey` and `runId` fields for exactly this purpose.

**Warning signs:** AI draft content appearing in dashboard chat, or dashboard messages leaking into draft generation.

### Pitfall 2: Connection Lifecycle During Deployment

**What goes wrong:** During deployment, the OpenClaw Gateway restarts. The backend loses its WebSocket connection and in-flight requests fail silently.

**Why it happens:** WebSocket connections are stateful -- unlike HTTP, a restart means all pending requests are lost.

**How to avoid:** Implement `ShutdownEvent` handler (the gateway sends `{ type: "event", event: "shutdown", payload: { reason, restartExpectedMs } }` before restarting). Queue requests during reconnection. Use idempotency keys so retried requests are safe.

**Warning signs:** "Gateway RPC timeout" errors after deployments, lost notifications.

### Pitfall 3: Draft Generation Architecture Change

**What goes wrong:** The current draft generator sends a fully assembled system prompt + conversation history to `/v1/chat/completions`. The WebSocket `chat.send` method takes a simple `message` string and the OpenClaw agent handles prompt assembly. This is a fundamentally different execution model.

**Why it happens:** HTTP chat completions = stateless, backend builds the full prompt. WebSocket chat.send = stateful, OpenClaw agent maintains session context and builds the prompt from its own system prompt + session history.

**How to avoid:** Two approaches:
1. **Use the `agent` method** instead of `chat.send` for draft generation. Agent method takes `extraSystemPrompt` and `message` params and runs an isolated agent turn.
2. **Keep the HTTP endpoint** just for draft generation and switch only dashboard chat and hooks to WebSocket. (But this defeats the unified connection goal.)

**Warning signs:** Draft quality drops because context is wrong; drafts don't include business context (FAQ, guest data, availability).

### Pitfall 4: Frontend SSE Contract Change

**What goes wrong:** The frontend `use-assistant.ts` hook parses OpenAI-compatible SSE format (`data: {"choices":[{"delta":{"content":"..."}}]}`). If the WebSocket-to-SSE bridge produces a different format, the frontend breaks.

**Why it happens:** The WS `ChatEvent` format (`{runId, sessionKey, state, message}`) is different from the OpenAI SSE delta format. A transform layer is needed.

**How to avoid:** The backend must transform `ChatEvent` payloads into the same OpenAI-compatible SSE format the frontend already parses. This is a backend concern -- the frontend should not change.

**Warning signs:** Chat messages appearing garbled, tool calls not showing up, stream not terminating.

### Pitfall 5: Tick Timeout / Dead Connection Detection

**What goes wrong:** The WebSocket connection appears open but is actually dead (network issue, gateway frozen). All RPC requests hang indefinitely.

**Why it happens:** TCP connections can remain half-open for minutes. Without active probing, the client doesn't know the connection is dead.

**How to avoid:** The Gateway sends `tick` events at `tickIntervalMs` (from `hello-ok.policy.tickIntervalMs`, default 15000ms). If no tick arrives within 2x the interval, consider the connection dead and reconnect. Also implement WebSocket ping/pong (using `ws` library's ping support).

**Warning signs:** Requests timing out, "connection open but no response" patterns.

### Pitfall 6: Hook Mapping Behavior Change

**What goes wrong:** Current HTTP webhooks use the `hooks.mappings` config in `openclaw.json` to route messages (e.g., `POST /hooks/briefing` -> agent run with `deliver: true`). Switching to the WS `agent` method bypasses this mapping layer entirely.

**Why it happens:** The webhook endpoint interprets `hooks.mappings` server-side. The WS `agent` method is a direct agent invocation -- no mapping lookup occurs.

**How to avoid:** When calling `agent` via WS, explicitly pass the same params that the mapping would have resolved: `agentId`, `sessionKey`, `deliver`, `channel`, `to`. The backend must replicate the mapping logic that `openclaw.json` currently handles.

**Warning signs:** Notifications not being delivered to WhatsApp; briefings processed but not forwarded to channels.

## Code Examples

### WebSocket Connect Handshake

```typescript
// Source: OpenClaw protocol v3 spec (docs.openclaw.ai/gateway/protocol)
// and GatewayClient type definitions from openclaw/plugin-sdk

import WebSocket from 'ws';

function connectToGateway(url: string, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);

    ws.on('message', (data) => {
      const frame = JSON.parse(data.toString());

      if (frame.type === 'event' && frame.event === 'connect.challenge') {
        // Respond with connect request
        ws.send(JSON.stringify({
          type: 'req',
          id: crypto.randomUUID(),
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: 'gateway-client',
              version: '1.0.0',
              platform: 'linux',
              mode: 'backend',
            },
            role: 'operator',
            scopes: ['operator.read', 'operator.write'],
            auth: { token },
          },
        }));
      }

      if (frame.type === 'res' && frame.ok && frame.payload?.type === 'hello-ok') {
        resolve(ws);
      }

      if (frame.type === 'res' && !frame.ok) {
        reject(new Error(frame.error?.message ?? 'Connect failed'));
      }
    });

    ws.on('error', reject);
  });
}
```

### Chat Send with Event Streaming

```typescript
// Source: ChatSendParamsSchema and ChatEventSchema from openclaw/plugin-sdk

// Sending a chat message via WebSocket RPC
const chatSendParams = {
  sessionKey: 'dashboard:ines',
  message: 'Show me today\'s bookings',
  idempotencyKey: crypto.randomUUID(),
};

ws.send(JSON.stringify({
  type: 'req',
  id: crypto.randomUUID(),
  method: 'chat.send',
  params: chatSendParams,
}));

// Responses come as events:
// { type: "event", event: "chat", payload: { runId, sessionKey, seq, state: "delta", message: {...} } }
// { type: "event", event: "chat", payload: { runId, sessionKey, seq, state: "final", usage: {...} } }
```

### Agent Request (Hook Replacement)

```typescript
// Source: AgentParamsSchema from openclaw/plugin-sdk

// Replace: POST /hooks/briefing with body { message }
// With:
const agentParams = {
  message: briefingText,
  agentId: 'main',
  sessionKey: 'hook:briefing',
  deliver: true,        // Forward to connected channels (WhatsApp)
  idempotencyKey: crypto.randomUUID(),
};

ws.send(JSON.stringify({
  type: 'req',
  id: crypto.randomUUID(),
  method: 'agent',
  params: agentParams,
}));
```

### Session Management

```typescript
// Source: SessionsResetParamsSchema from openclaw/plugin-sdk

// Reset a chat session
ws.send(JSON.stringify({
  type: 'req',
  id: crypto.randomUUID(),
  method: 'sessions.reset',
  params: {
    key: 'dashboard:ines',
    reason: 'new',
  },
}));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HTTP `/v1/chat/completions` | WebSocket `chat.send` + `chat` events | Gateway protocol v3 (2025+) | Persistent connection, native streaming, session management |
| HTTP `/hooks/*` webhooks | WebSocket `agent` RPC method | Same | No separate auth token needed, same connection |
| SSE proxy (fetch -> pipe) | WS event bridge -> SSE | This phase | Backend transforms events instead of proxying bytes |
| Stateless HTTP per request | Stateful WS with session keys | Same | Better session management, connection reuse |

**Deprecated/outdated:**
- The HTTP `/v1/chat/completions` endpoint remains available but is a compatibility shim over the native WS protocol. It's stateless-by-default and lacks session management features (as documented in GitHub issue #20934).
- The `/hooks/*` webhook endpoint works but is a secondary interface. The `agent` RPC method provides the same functionality natively.

## Open Questions

1. **Draft generation context injection**
   - What we know: Current draft generator builds a full system prompt with business context (guest data, FAQ, availability) and sends it as the `system` message in the chat completions API. The WS `chat.send` method takes a bare `message` string and the agent runtime assembles its own context.
   - What's unclear: Can `extraSystemPrompt` in the `agent` method inject the business context? Or does draft generation need to remain on HTTP? How does the agent's existing system prompt interact with an `extraSystemPrompt` override?
   - Recommendation: Test the `agent` method with `extraSystemPrompt` to verify business context injection works. If it doesn't, keep draft generation on HTTP and migrate only chat + hooks to WS (pragmatic hybrid approach).

2. **OpenAI SSE format compatibility**
   - What we know: The `ChatEvent` payload has `{ state, message, usage }`. The current frontend expects OpenAI-format SSE deltas (`{ choices: [{ delta: { content, tool_calls } }] }`).
   - What's unclear: What exactly is in the `message` field of a `ChatEvent` delta? Is it an OpenAI-format message object, or a plain text string, or something else? The schema types it as `TUnknown`.
   - Recommendation: Instrument a test WS connection, send a chat message, and log the raw `ChatEvent` payloads to determine the exact shape. Build the SSE transform from observed data.

3. **Concurrent draft generation isolation**
   - What we know: Multiple AI draft generation jobs can run concurrently (one per new inbound email). Each needs its own isolated session context.
   - What's unclear: How to ensure proper isolation when multiple `chat.send` calls with different session keys run simultaneously through one WS connection. Are `ChatEvent` emissions properly scoped by `sessionKey`?
   - Recommendation: Yes, `ChatEvent` includes `sessionKey` and `runId` -- use both for routing. Each draft job should use a unique session key (e.g., `draft:<conversationId>:<timestamp>`).

4. **Health check approach**
   - What we know: Current health check calls `/v1/chat/completions` with `max_tokens: 1`. With WS, the connection state itself is the health indicator.
   - What's unclear: Should health check verify the WS is connected, or should it also verify the agent runtime is responsive?
   - Recommendation: Health check = `gateway.isConnected` for basic, plus an RPC `status` call for deep health (the `hello-ok` snapshot includes health data).

5. **Hook token vs gateway token unification**
   - What we know: Currently the backend uses `OPENCLAW_GATEWAY_TOKEN` for chat completions and `OPENCLAW_HOOK_TOKEN` for webhooks -- two separate tokens. With WS, only one connection with one token is needed.
   - What's unclear: Can `OPENCLAW_HOOK_TOKEN` be removed entirely? Or is it still needed for something?
   - Recommendation: With full WS migration, `OPENCLAW_HOOK_TOKEN` can be removed from the backend. The WS connection authenticates once with `OPENCLAW_GATEWAY_TOKEN`. Keep the hook config in `openclaw.json` only if external systems still POST webhooks.

## Sources

### Primary (HIGH confidence)
- OpenClaw npm package (v2026.2.21-2) type definitions -- `dist/plugin-sdk/gateway/protocol/schema/*.d.ts` -- all TypeBox schema definitions examined directly from installed package
- OpenClaw npm package `GatewayClient` class -- `dist/plugin-sdk/gateway/client.d.ts` -- connection options, request method signature
- PYR backend source code -- all 3 HTTP integration points identified and examined

### Secondary (MEDIUM confidence)
- [OpenClaw Gateway Protocol Docs](https://docs.openclaw.ai/gateway/protocol) -- connect handshake, frame types, roles/scopes
- [OpenClaw Gateway Protocol (learnclawdbot.org)](https://www.learnclawdbot.org/docs/gateway/protocol) -- protocol v3 spec, JSON examples for connect frame
- [OpenClaw Gateway Configuration (DeepWiki)](https://deepwiki.com/openclaw/openclaw/3.1-gateway-configuration) -- HTTP vs WS architecture, binding modes, session management
- [OpenClaw Webhooks Docs](https://docs.openclaw.ai/automation/webhook.md) -- webhook endpoint format, auth, agent triggering
- [OpenClaw HTTP API Docs](https://docs.openclaw.ai/gateway/openai-http-api.md) -- HTTP endpoint limitations vs WS, stateless sessions
- [GitHub Issue #20934](https://github.com/openclaw/openclaw/issues/20934) -- session management gaps in HTTP API, motivation for WS

### Tertiary (LOW confidence)
- [OpenClaw Architecture Overview (Substack)](https://ppaolo.substack.com/p/openclaw-system-architecture-overview) -- general architecture, event subscription model
- [OpenClaw Studio (GitHub)](https://github.com/grp06/openclaw-studio) -- two-WS-hop architecture pattern for web dashboards
- [OpenClaw Deck (GitHub)](https://github.com/kellyclaudeai/openclaw-deck) -- community GatewayClient usage pattern

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM -- `ws` is clearly the right choice for server-side WS; protocol types are well-defined in the package. However, the `chat.send` method and `ChatEvent` payload shapes are typed as `TUnknown` in the schema, which limits static type safety.
- Architecture: MEDIUM -- The overall pattern (persistent WS, RPC bridge, SSE transform) is well-understood. The specific integration with OpenClaw's agent runtime for draft generation has unknowns around context injection (`extraSystemPrompt` behavior).
- Pitfalls: HIGH -- Well-documented from protocol spec examination, community projects, and GitHub issues. The key risks (event routing, hook mapping, SSE format) are clearly identifiable.

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable -- OpenClaw protocol v3 is the current version, unlikely to change within 30 days)
