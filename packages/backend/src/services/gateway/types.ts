/** WebSocket RPC frame types for OpenClaw Gateway protocol v3 */

// -- Outbound frames (backend -> gateway) --

export interface RpcRequest {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

export interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    version: string;
    platform: string;
    mode: string;
  };
  role: string;
  scopes: string[];
  auth: { token: string };
}

export interface ChatSendParams {
  sessionKey: string;
  message: string;
  idempotencyKey: string;
}

export interface AgentParams {
  message: string;
  agentId: string;
  sessionKey: string;
  deliver: boolean;
  idempotencyKey: string;
  extraSystemPrompt?: string;
}

export interface SessionsResetParams {
  key: string;
  reason: string;
}

// -- Inbound frames (gateway -> backend) --

export interface RpcResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
}

export interface GatewayEvent {
  type: 'event';
  event: string;
  payload?: unknown;
}

export type InboundFrame = RpcResponse | GatewayEvent;

// -- Chat event payload --

export interface ChatEvent {
  runId: string;
  sessionKey: string;
  seq: number;
  state: 'delta' | 'final' | 'error' | 'aborted';
  message?: unknown;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  model?: string;
  errorMessage?: string;
}

// -- HelloOk payload from connect response --

export interface HelloOkPayload {
  type: 'hello-ok';
  protocol: number;
  policy?: {
    tickIntervalMs?: number;
  };
}

// -- GatewayWsClient options --

export interface GatewayWsClientOptions {
  url: string;
  token: string;
  reconnectMs?: number;
  requestTimeoutMs?: number;
}
