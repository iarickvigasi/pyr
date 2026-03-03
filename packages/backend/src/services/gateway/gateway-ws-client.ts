import WebSocket from 'ws';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import type { FastifyBaseLogger } from 'fastify';
import type {
  ChatEvent,
  ConnectParams,
  GatewayWsClientOptions,
  HelloOkPayload,
  InboundFrame,
  RpcRequest,
} from './types.js';

/** Maximum reconnection delay in milliseconds */
const MAX_RECONNECT_MS = 30_000;

/** Default request timeout: 120 seconds */
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

/** Default initial reconnection delay: 3 seconds */
const DEFAULT_RECONNECT_MS = 3_000;

/** Default tick interval used before hello-ok provides the real value */
const DEFAULT_TICK_INTERVAL_MS = 15_000;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type ChatEventHandler = (event: ChatEvent) => void;

interface AgentRunState {
  sessionKey?: string;
  text: string;
}

/**
 * Persistent WebSocket client for the OpenClaw Gateway RPC protocol v3.
 *
 * Handles: connect handshake, auto-reconnect with exponential backoff,
 * RPC request/response correlation, and chat event routing by sessionKey.
 */
export class GatewayWsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private chatListeners = new Set<ChatEventHandler>();
  private agentRuns = new Map<string, AgentRunState>();
  private connected = false;
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private tickIntervalMs = DEFAULT_TICK_INTERVAL_MS;
  private currentBackoff: number;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;
  private connectRequestId: string | null = null;

  private readonly url: string;
  private readonly token: string;
  private readonly reconnectMs: number;
  private readonly requestTimeoutMs: number;
  private readonly log: FastifyBaseLogger;

  constructor(opts: GatewayWsClientOptions, logger: FastifyBaseLogger) {
    super();
    this.url = opts.url;
    this.token = opts.token;
    this.reconnectMs = opts.reconnectMs ?? DEFAULT_RECONNECT_MS;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.currentBackoff = this.reconnectMs;
    this.log = logger.child({ service: 'gateway-ws' });
  }

  /**
   * Open a WebSocket connection to the gateway and complete the connect handshake.
   * If the gateway is unavailable, the client retries via reconnection logic.
   */
  async start(): Promise<void> {
    if (this.closed) return;
    return this.connect();
  }

  /**
   * Gracefully close the WebSocket connection.
   * Rejects all pending requests and clears all timers.
   */
  async stop(): Promise<void> {
    this.closed = true;
    this.clearReconnectTimer();
    this.clearTickTimer();
    this.rejectAllPending('Client closing');
    this.agentRuns.clear();

    if (this.ws) {
      try {
        this.ws.close(1000, 'Client shutting down');
      } catch {
        // WebSocket may already be closed
      }
      this.ws = null;
    }

    this.connected = false;
    this.log.info('Gateway WebSocket client stopped');
  }

  /**
   * Send an RPC request and await the correlated response.
   * Rejects on timeout or if the gateway returns an error.
   */
  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gateway connection not ready');
    }

    const id = crypto.randomUUID();
    const frame: RpcRequest = { type: 'req', id, method, params };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Gateway RPC timeout: ${method}`));
      }, this.requestTimeoutMs);

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      this.ws!.send(JSON.stringify(frame), (err) => {
        if (err) {
          this.pending.delete(id);
          clearTimeout(timer);
          reject(new Error(`Gateway send failed: ${err.message}`));
        }
      });
    });
  }

  /**
   * Register a listener for chat events.
   * Returns an unsubscribe function. Multiple listeners can be active
   * simultaneously (e.g., concurrent dashboard chat + draft generation).
   */
  onChatEvent(handler: ChatEventHandler): () => void {
    this.chatListeners.add(handler);
    return () => {
      this.chatListeners.delete(handler);
    };
  }

  /** Whether the WebSocket connection is established and the handshake is complete */
  get isConnected(): boolean {
    return this.connected;
  }

  // -- Private: connection lifecycle --

  private async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.closed) {
        resolve();
        return;
      }

      this.connectResolve = resolve;
      this.connectReject = reject;

      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        this.log.error({ err }, 'Failed to create WebSocket');
        this.connectResolve = null;
        this.connectReject = null;
        this.scheduleReconnect();
        resolve(); // Don't block startup -- reconnect will handle it
        return;
      }

      this.ws.on('open', () => {
        this.log.info({ url: this.url }, 'WebSocket opened, awaiting connect.challenge');
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data);
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        const reasonStr = reason.toString() || 'unknown';
        this.log.warn({ code, reason: reasonStr }, 'WebSocket closed');
        this.handleDisconnect();
      });

      this.ws.on('error', (err: Error) => {
        this.log.error({ err: err.message }, 'WebSocket error');
        // If we haven't completed the handshake, resolve the start() promise
        // so we don't block Fastify startup. Reconnect logic will handle retry.
        if (this.connectResolve) {
          const savedResolve = this.connectResolve;
          this.connectResolve = null;
          this.connectReject = null;
          savedResolve();
        }
      });
    });
  }

  private handleMessage(data: Buffer): void {
    // Reset tick timeout on any incoming message
    this.resetTickTimer();

    let frame: InboundFrame;
    try {
      frame = JSON.parse(data.toString()) as InboundFrame;
    } catch {
      this.log.warn('Received non-JSON WebSocket message');
      return;
    }

    if (frame.type === 'event') {
      this.handleEvent(frame.event, frame.payload);
      return;
    }

    if (frame.type === 'res') {
      this.handleResponse(frame.id, frame.ok, frame.payload, frame.error);
      return;
    }
  }

  private handleEvent(event: string, payload: unknown): void {
    if (event === 'connect.challenge') {
      this.sendConnectRequest();
      return;
    }

    // OpenClaw protocol v3 uses `agent` events for streaming run output.
    // Normalize these to legacy ChatEvent shape expected by AI draft workers.
    if (event === 'agent') {
      this.handleAgentEvent(payload);
      return;
    }

    if (event === 'chat') {
      const chatEvent = payload as ChatEvent;
      this.emitChatEvent(chatEvent);
      return;
    }

    if (event === 'shutdown') {
      const shutdownPayload = payload as { reason?: string; restartExpectedMs?: number } | undefined;
      this.log.warn(
        { reason: shutdownPayload?.reason, restartExpectedMs: shutdownPayload?.restartExpectedMs },
        'Gateway shutdown event received, preparing for reconnect',
      );
      return;
    }

    // Other events (e.g., tick) are handled by the tick timer reset above
  }

  private emitChatEvent(chatEvent: ChatEvent): void {
    for (const handler of this.chatListeners) {
      try {
        handler(chatEvent);
      } catch (err) {
        this.log.error({ err }, 'Chat event handler error');
      }
    }
  }

  /**
   * Map protocol v3 `agent` event payloads to legacy ChatEvent states.
   *
   * Agent payload shape:
   * {
   *   runId: string,
   *   seq: number,
   *   stream: "assistant" | "lifecycle" | "error" | ...,
   *   data: { sessionKey?: string, text?: string, phase?: string, ... }
   * }
   */
  private handleAgentEvent(payload: unknown): void {
    const evt = payload as {
      runId?: string;
      seq?: number;
      stream?: string;
      sessionKey?: string;
      data?: Record<string, unknown>;
    };

    const runId = evt.runId;
    const stream = evt.stream;
    if (!runId || !stream) return;

    const data = (evt.data ?? {}) as Record<string, unknown>;
    const seq = typeof evt.seq === 'number' ? evt.seq : 0;

    const existing = this.agentRuns.get(runId) ?? { text: '' };
    const sessionKey = typeof evt.sessionKey === 'string'
      ? evt.sessionKey
      : typeof data.sessionKey === 'string'
        ? data.sessionKey
        : typeof data.session === 'string'
          ? data.session
          : existing.sessionKey;
    const state: AgentRunState = { ...existing, sessionKey };
    this.agentRuns.set(runId, state);

    if (stream === 'assistant') {
      const fullText = typeof data.text === 'string' ? data.text : null;
      const deltaFromPayload = typeof data.delta === 'string' ? data.delta : '';
      if (!sessionKey || (!fullText && !deltaFromPayload)) return;

      // Some OpenClaw agents emit delta as a full snapshot, not an incremental token.
      // To avoid duplicated accumulation downstream, prefer snapshot semantics whenever
      // cumulative text is present; only use delta append when text is unavailable.
      let emittedContent = '';
      let snapshot = false;

      if (fullText !== null) {
        if (fullText === state.text) return; // unchanged snapshot, no-op
        state.text = fullText;
        emittedContent = fullText;
        snapshot = true;
      } else if (deltaFromPayload.length > 0) {
        state.text += deltaFromPayload;
        emittedContent = deltaFromPayload;
        snapshot = false;
      }
      this.agentRuns.set(runId, state);

      if (emittedContent.length > 0) {
        this.emitChatEvent({
          runId,
          sessionKey,
          seq,
          state: 'delta',
          message: { content: emittedContent, snapshot },
        });
      }
      return;
    }

    if (stream === 'lifecycle' && sessionKey) {
      const phase = typeof data.phase === 'string' ? data.phase : '';

      if (phase === 'end') {
        this.emitChatEvent({
          runId,
          sessionKey,
          seq,
          state: 'final',
          message: { content: state.text, snapshot: true },
          model: typeof data.model === 'string' ? data.model : undefined,
          usage: this.normalizeUsage(data.usage),
        });
        this.agentRuns.delete(runId);
        return;
      }

      if (phase === 'aborted' || phase === 'cancelled') {
        this.emitChatEvent({
          runId,
          sessionKey,
          seq,
          state: 'aborted',
        });
        this.agentRuns.delete(runId);
        return;
      }
      return;
    }

    if (stream === 'error' && sessionKey) {
      const errorMessage = typeof data.error === 'string'
        ? data.error
        : typeof data.message === 'string'
          ? data.message
          : 'Agent stream error';

      this.emitChatEvent({
        runId,
        sessionKey,
        seq,
        state: 'error',
        errorMessage,
      });
      this.agentRuns.delete(runId);
    }
  }

  private normalizeUsage(
    usage: unknown,
  ): ChatEvent['usage'] {
    if (!usage || typeof usage !== 'object') return undefined;
    const data = usage as Record<string, unknown>;

    const prompt = typeof data.prompt_tokens === 'number' ? data.prompt_tokens : undefined;
    const completion = typeof data.completion_tokens === 'number' ? data.completion_tokens : undefined;
    const cacheRead = typeof data.cache_read_input_tokens === 'number'
      ? data.cache_read_input_tokens
      : undefined;
    const cacheWrite = typeof data.cache_creation_input_tokens === 'number'
      ? data.cache_creation_input_tokens
      : undefined;

    if (prompt === undefined || completion === undefined) return undefined;
    return {
      prompt_tokens: prompt,
      completion_tokens: completion,
      cache_read_input_tokens: cacheRead,
      cache_creation_input_tokens: cacheWrite,
    };
  }

  private handleResponse(
    id: string,
    ok: boolean,
    payload: unknown,
    error?: { code: string; message: string },
  ): void {
    // Handle connect handshake response
    if (id === this.connectRequestId) {
      this.connectRequestId = null;

      if (ok) {
        const helloOk = payload as HelloOkPayload;
        if (helloOk?.policy?.tickIntervalMs) {
          this.tickIntervalMs = helloOk.policy.tickIntervalMs;
        }
        this.connected = true;
        this.currentBackoff = this.reconnectMs; // Reset backoff on success
        this.resetTickTimer();
        this.log.info(
          { protocol: helloOk?.protocol, tickIntervalMs: this.tickIntervalMs },
          'Gateway WebSocket connected and authenticated',
        );

        if (this.connectResolve) {
          this.connectResolve();
          this.connectResolve = null;
          this.connectReject = null;
        }
      } else {
        const errMsg = error?.message ?? 'Connect handshake failed';
        this.log.error({ error }, errMsg);

        if (this.connectResolve) {
          // Don't block startup -- resolve and let reconnect handle it
          this.connectResolve();
          this.connectResolve = null;
          this.connectReject = null;
        }
        this.scheduleReconnect();
      }
      return;
    }

    // Handle regular RPC responses
    const pending = this.pending.get(id);
    if (!pending) {
      this.log.warn({ id }, 'Received response for unknown request');
      return;
    }

    this.pending.delete(id);
    clearTimeout(pending.timer);

    if (ok) {
      pending.resolve(payload);
    } else {
      pending.reject(new Error(error?.message ?? 'Gateway RPC error'));
    }
  }

  private sendConnectRequest(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.connectRequestId = crypto.randomUUID();

    const params: ConnectParams = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        // Must match OpenClaw's allowed client-id enum.
        id: 'gateway-client',
        version: '1.0.0',
        platform: process.platform,
        mode: 'backend',
      },
      role: 'operator',
      scopes: ['operator.admin', 'operator.read', 'operator.write'],
      auth: { token: this.token },
    };

    const frame: RpcRequest = {
      type: 'req',
      id: this.connectRequestId,
      method: 'connect',
      params,
    };

    this.ws.send(JSON.stringify(frame), (err) => {
      if (err) {
        this.log.error({ err: err.message }, 'Failed to send connect request');
      }
    });
  }

  // -- Private: reconnection --

  private handleDisconnect(): void {
    this.connected = false;
    this.clearTickTimer();
    this.rejectAllPending('Gateway connection lost');
    this.agentRuns.clear();

    if (!this.closed) {
      this.scheduleReconnect();
    }

    // If still in initial connect, resolve so startup isn't blocked
    if (this.connectResolve) {
      this.connectResolve();
      this.connectResolve = null;
      this.connectReject = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;

    // Add jitter: +/- 25% of current backoff
    const jitter = this.currentBackoff * 0.25 * (Math.random() * 2 - 1);
    const delay = Math.min(this.currentBackoff + jitter, MAX_RECONNECT_MS);

    this.log.warn({ delayMs: Math.round(delay) }, 'Scheduling gateway reconnect');

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed) {
        this.connect().catch((err) => {
          this.log.error({ err }, 'Reconnection attempt failed');
        });
      }
    }, delay);

    // Exponential backoff: double the delay for next attempt
    this.currentBackoff = Math.min(this.currentBackoff * 2, MAX_RECONNECT_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // -- Private: tick timeout --

  private resetTickTimer(): void {
    this.clearTickTimer();
    if (!this.connected || this.closed) return;

    // If no message arrives within 2x tickInterval, connection is dead
    this.tickTimer = setTimeout(() => {
      this.log.warn(
        { intervalMs: this.tickIntervalMs },
        'Tick timeout -- no message received, forcing reconnect',
      );
      this.ws?.close(4000, 'Tick timeout');
    }, this.tickIntervalMs * 2);
  }

  private clearTickTimer(): void {
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
  }

  // -- Private: cleanup --

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pending.delete(id);
    }
  }
}
