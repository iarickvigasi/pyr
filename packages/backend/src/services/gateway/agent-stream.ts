import crypto from 'crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { GatewayWsClient } from './gateway-ws-client.js';
import type { ChatEvent } from './types.js';

export interface CollectAgentTextParams {
  gateway: GatewayWsClient;
  sessionKey: string;
  message: string;
  extraSystemPrompt: string;
  timeoutMs: number;
  timeoutMessage: string;
  logger?: FastifyBaseLogger;
  requestErrorLogMessage?: string;
}

export function extractJsonBlock(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

function extractEventText(message: unknown): { text: string; snapshot: boolean } {
  if (!message || typeof message !== 'object') return { text: '', snapshot: false };
  const msg = message as Record<string, unknown>;
  const content = msg.content;
  const snapshot = msg.snapshot === true;

  if (typeof content === 'string') {
    return { text: content, snapshot };
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const block = part as Record<string, unknown>;
        return typeof block.text === 'string' ? block.text : '';
      })
      .join('');
    return { text, snapshot };
  }

  return { text: '', snapshot: false };
}

export async function collectAgentText(params: CollectAgentTextParams): Promise<string> {
  const {
    gateway,
    sessionKey,
    message,
    extraSystemPrompt,
    timeoutMs,
    timeoutMessage,
    logger,
    requestErrorLogMessage,
  } = params;

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let content = '';
    let sawScopedSessionEvent = false;
    const agentScopedSessionKey = `agent:main:${sessionKey}`;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsub();
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    const unsub = gateway.onChatEvent((event: ChatEvent) => {
      const isScopedSession = event.sessionKey === agentScopedSessionKey;
      const isUnscopedSession = event.sessionKey === sessionKey;
      if (!isScopedSession && !isUnscopedSession) {
        return;
      }
      if (isScopedSession) {
        sawScopedSessionEvent = true;
      }
      if (isUnscopedSession && sawScopedSessionEvent) {
        return;
      }

      if (event.state === 'delta' && event.message) {
        const { text, snapshot } = extractEventText(event.message);
        if (text) {
          content = snapshot ? text : (content + text);
        }
        return;
      }

      if (event.state === 'final') {
        if (event.message) {
          const { text, snapshot } = extractEventText(event.message);
          if (text) {
            content = snapshot ? text : (content + text);
          }
        }
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        unsub();
        resolve(content.trim());
        return;
      }

      if (event.state === 'error') {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        unsub();
        reject(new Error(event.errorMessage ?? 'OpenClaw agent stream error'));
        return;
      }

      if (event.state === 'aborted') {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        unsub();
        reject(new Error('OpenClaw agent stream aborted'));
      }
    });

    gateway.request('agent', {
      message,
      agentId: 'main',
      sessionKey,
      deliver: false,
      idempotencyKey: crypto.randomUUID(),
      extraSystemPrompt,
    }).catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsub();
      if (logger && requestErrorLogMessage) {
        logger.warn({ err }, requestErrorLogMessage);
      }
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}
