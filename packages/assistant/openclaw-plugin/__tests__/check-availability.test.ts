import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';
import { registerRoomTools } from '../tools/rooms.js';

// ─── Mock ApiClient and OpenClawPluginApi ───────────────────

interface RegisteredTool {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (id: string, params: Record<string, unknown>) => Promise<unknown>;
}

function createMockApi(): { api: OpenClawPluginApi; tools: Map<string, RegisteredTool> } {
  const tools = new Map<string, RegisteredTool>();
  const api = {
    registerTool: vi.fn((tool: RegisteredTool) => {
      tools.set(tool.name, tool);
    }),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    pluginConfig: {},
  } as unknown as OpenClawPluginApi;

  return { api, tools };
}

// ─── Tests ──────────────────────────────────────────────────

describe('check_availability tool', () => {
  let mockGet: ReturnType<typeof vi.fn>;
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGet = vi.fn().mockResolvedValue([
      {
        id: 'room-1',
        name: 'Suite A',
        roomType: { name: 'Suite', basePrice: 15000, maxOccupancy: 2 },
        totalPrice: 60000,
      },
    ]);

    const client: ApiClient = {
      get: mockGet,
      post: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    };

    const mock = createMockApi();
    tools = mock.tools;
    registerRoomTools(mock.api, client);
  });

  it('should register check_availability tool with checkIn and checkOut params', () => {
    const tool = tools.get('check_availability');
    expect(tool).toBeDefined();
    expect(tool!.parameters).toEqual({
      type: 'object',
      properties: {
        checkIn: { type: 'string', description: expect.any(String) },
        checkOut: { type: 'string', description: expect.any(String) },
      },
      required: ['checkIn', 'checkOut'],
    });
  });

  it('should NOT have from or to in parameter definitions', () => {
    const tool = tools.get('check_availability');
    const props = (tool!.parameters as { properties: Record<string, unknown> }).properties;
    expect(props).not.toHaveProperty('from');
    expect(props).not.toHaveProperty('to');
  });

  it('should call /api/v1/availability with checkIn and checkOut params', async () => {
    const tool = tools.get('check_availability')!;
    await tool.execute('test-id', { checkIn: '2026-03-15', checkOut: '2026-03-19' });

    expect(mockGet).toHaveBeenCalledWith('/api/v1/availability', {
      checkIn: '2026-03-15',
      checkOut: '2026-03-19',
    });
  });

  it('should NOT pass from or to keys to client.get', async () => {
    const tool = tools.get('check_availability')!;
    await tool.execute('test-id', { checkIn: '2026-03-15', checkOut: '2026-03-19' });

    const callArgs = mockGet.mock.calls[0]!;
    const params = callArgs[1] as Record<string, string>;
    expect(params).not.toHaveProperty('from');
    expect(params).not.toHaveProperty('to');
  });

  it('should return dateRange with checkIn and checkOut in response', async () => {
    const tool = tools.get('check_availability')!;
    const result = await tool.execute('test-id', { checkIn: '2026-03-15', checkOut: '2026-03-19' });

    const content = (result as { content: Array<{ text: string }> }).content[0]!;
    const parsed = JSON.parse(content.text);

    expect(parsed.dateRange).toEqual({
      checkIn: '2026-03-15',
      checkOut: '2026-03-19',
    });
    expect(parsed.dateRange).not.toHaveProperty('from');
    expect(parsed.dateRange).not.toHaveProperty('to');
  });

  it('should return available rooms with formatted data', async () => {
    const tool = tools.get('check_availability')!;
    const result = await tool.execute('test-id', { checkIn: '2026-03-15', checkOut: '2026-03-19' });

    const content = (result as { content: Array<{ text: string }> }).content[0]!;
    const parsed = JSON.parse(content.text);

    expect(parsed.totalAvailable).toBe(1);
    expect(parsed.availableRooms[0].roomName).toBe('Suite A');
    expect(parsed.availableRooms[0].roomType).toBe('Suite');
  });
});
