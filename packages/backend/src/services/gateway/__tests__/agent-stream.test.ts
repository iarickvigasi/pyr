import { describe, expect, it, vi } from 'vitest';
import type { ChatEvent } from '../types.js';
import type { GatewayWsClient } from '../gateway-ws-client.js';
import { collectAgentText, extractJsonBlock } from '../agent-stream.js';

function createGatewayMock() {
  const listeners: Array<(event: ChatEvent) => void> = [];

  const onChatEvent = vi.fn((listener: (event: ChatEvent) => void) => {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    };
  });

  const request = vi.fn();

  return {
    gateway: {
      onChatEvent,
      request,
    },
    emit(event: ChatEvent) {
      for (const listener of [...listeners]) {
        listener(event);
      }
    },
  };
}

describe('agent-stream helper', () => {
  it('collects text from scoped session and prefers final snapshot content', async () => {
    const mock = createGatewayMock();
    const sessionKey = 'email-classify:conv:123';

    mock.gateway.request.mockImplementation(async () => {
      mock.emit({
        runId: 'run-1',
        sessionKey: `agent:main:${sessionKey}`,
        seq: 1,
        state: 'delta',
        message: {
          role: 'assistant',
          content: 'partial text',
        },
      });

      // Unscoped duplicate should be ignored once scoped events are seen.
      mock.emit({
        runId: 'run-1',
        sessionKey,
        seq: 2,
        state: 'delta',
        message: {
          role: 'assistant',
          content: 'duplicate-unscoped',
        },
      });

      mock.emit({
        runId: 'run-1',
        sessionKey: `agent:main:${sessionKey}`,
        seq: 3,
        state: 'final',
        message: {
          role: 'assistant',
          snapshot: true,
          content: [
            { type: 'text', text: '{"category":"conversation"}' },
          ],
        },
      });
    });

    const text = await collectAgentText({
      gateway: mock.gateway as unknown as GatewayWsClient,
      sessionKey,
      message: 'test',
      extraSystemPrompt: 'system',
      timeoutMs: 2_000,
      timeoutMessage: 'timed out',
    });

    expect(text).toBe('{"category":"conversation"}');
  });

  it('rejects with timeout when no final/error event arrives', async () => {
    const mock = createGatewayMock();
    const sessionKey = 'booking-analyze:conv:123';

    mock.gateway.request.mockResolvedValue(undefined);

    await expect(
      collectAgentText({
        gateway: mock.gateway as unknown as GatewayWsClient,
        sessionKey,
        message: 'test',
        extraSystemPrompt: 'system',
        timeoutMs: 20,
        timeoutMessage: 'analysis timed out',
      }),
    ).rejects.toThrow('analysis timed out');
  });

  it('extracts JSON blocks from raw and fenced responses', () => {
    expect(extractJsonBlock('{"ok":true}')).toBe('{"ok":true}');
    expect(extractJsonBlock('```json\n{"ok":true}\n```')).toBe('{"ok":true}');
    expect(extractJsonBlock('before {"ok":true} after')).toBe('{"ok":true}');
    expect(extractJsonBlock('no json')).toBeNull();
  });
});
