import { describe, expect, it, vi } from 'vitest';
import type { ChatEvent } from '../../gateway/types.js';
import { classifyEmailWithOpenClaw } from '../openclaw-classifier.js';
import type { ParsedEmail } from '../email-parser.js';

function createParsedEmail(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    messageId: '<msg-1@example.com>',
    inReplyTo: undefined,
    references: [],
    from: { name: 'Guest Example', address: 'guest@example.com' },
    to: [{ name: 'Host', address: 'host@example.com' }],
    subject: 'Booking question',
    text: 'Hello, I would like to book.',
    html: '<p>Hello, I would like to book.</p>',
    date: new Date('2026-03-04T10:00:00.000Z'),
    rawSource: Buffer.from('raw'),
    attachments: [],
    ...overrides,
  };
}

function createGatewayWithFinalMessage(content: string) {
  const listeners: Array<(event: ChatEvent) => void> = [];
  return {
    get isConnected() {
      return true;
    },
    onChatEvent(handler: (event: ChatEvent) => void) {
      listeners.push(handler);
      return () => {};
    },
    request: vi.fn().mockImplementation(async (_method: string, params: unknown) => {
      const sessionKey = (params as { sessionKey: string }).sessionKey;
      const event: ChatEvent = {
        runId: 'run-1',
        sessionKey: `agent:main:${sessionKey}`,
        seq: 1,
        state: 'final',
        message: {
          content,
          snapshot: true,
        },
      };
      listeners.forEach((listener) => listener(event));
      return { ok: true };
    }),
  };
}

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(),
} as const;

describe('classifyEmailWithOpenClaw', () => {
  it('returns OpenClaw category when gateway responds with valid JSON', async () => {
    const gateway = createGatewayWithFinalMessage(JSON.stringify({
      category: 'conversation',
      confidence: 0.94,
      reason: 'Direct customer email',
      suggestion: {
        name: 'Anna',
        email: 'anna@example.com',
        phone: null,
        shouldCreate: true,
      },
    }));

    const result = await classifyEmailWithOpenClaw({
      gateway: gateway as never,
      parsed: createParsedEmail(),
      logger: mockLogger as never,
    });

    expect(result.category).toBe('conversation');
    expect(result.source).toBe('openclaw');
    expect(result.suggestion.email).toBe('anna@example.com');
    expect(result.suggestion.shouldCreate).toBe(true);
  });

  it('returns safe openclaw_error result when gateway is disconnected', async () => {
    const gateway = {
      isConnected: false,
      onChatEvent: vi.fn(() => () => {}),
      request: vi.fn(),
    };

    const result = await classifyEmailWithOpenClaw({
      gateway: gateway as never,
      parsed: createParsedEmail(),
      logger: mockLogger as never,
    });

    expect(result.category).toBe('other');
    expect(result.source).toBe('openclaw_error');
    expect(result.reason).toMatch(/gateway/i);
  });

  it('returns safe openclaw_error result for malformed OpenClaw output', async () => {
    const gateway = createGatewayWithFinalMessage('not json at all');

    const result = await classifyEmailWithOpenClaw({
      gateway: gateway as never,
      parsed: createParsedEmail(),
      logger: mockLogger as never,
    });

    expect(result.category).toBe('other');
    expect(result.source).toBe('openclaw_error');
    expect(result.reason).toMatch(/invalid classification response format/i);
  });
});
