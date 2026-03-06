import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';
import { getPendingAction } from '../lib/confirmation.js';
import { registerActionTools } from '../tools/actions.js';
import { registerEventTools } from '../tools/events.js';

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

describe('event registration tools', () => {
  let mockGet: ReturnType<typeof vi.fn>;
  let mockPost: ReturnType<typeof vi.fn>;
  let mockPatch: ReturnType<typeof vi.fn>;
  let mockDel: ReturnType<typeof vi.fn>;
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGet = vi.fn();
    mockPost = vi.fn();
    mockPatch = vi.fn();
    mockDel = vi.fn();

    const client: ApiClient = {
      get: mockGet,
      post: mockPost,
      patch: mockPatch,
      del: mockDel,
    };

    const mock = createMockApi();
    tools = mock.tools;
    registerActionTools(mock.api, client);
    registerEventTools(mock.api, client);
  });

  it('prepare_cancel_event_registration resolves guest registration and confirm_action cancels it', async () => {
    mockGet
      .mockResolvedValueOnce({
        id: 'event-1',
        type: 'coffee_cake_cuddles',
        title: 'Coffee & Cuddles',
        date: '2026-03-07',
        time: '10:00',
        capacity: 6,
        location: 'Garden Lounge',
        description: null,
        _count: { eventBookings: 3 },
      })
      .mockResolvedValueOnce([
        {
          id: 'reg-1',
          status: 'confirmed',
          attendeeCount: 1,
          guest: { id: 'guest-1', name: 'Anika', email: 'anika@example.com', phone: null },
        },
      ]);
    mockPost.mockResolvedValueOnce({
      id: 'reg-1',
      status: 'cancelled',
      guest: { id: 'guest-1', name: 'Anika', email: 'anika@example.com' },
    });

    const prepareTool = tools.get('prepare_cancel_event_registration');
    const confirmTool = tools.get('confirm_action');
    expect(prepareTool).toBeDefined();
    expect(confirmTool).toBeDefined();

    const prepareResult = await prepareTool!.execute('id', {
      eventId: 'event-1',
      guestName: 'Anika',
    });
    const prepareContent = (prepareResult as { content: Array<{ text: string }> }).content[0]!;
    const prepared = JSON.parse(prepareContent.text) as { actionId: string };

    expect(prepared.actionId).toBeTruthy();
    expect(getPendingAction(prepared.actionId)?.type).toBe('cancel_event_registration');

    const confirmResult = await confirmTool!.execute('id', { actionId: prepared.actionId });
    const confirmContent = (confirmResult as { content: Array<{ text: string }> }).content[0]!;
    const confirmed = JSON.parse(confirmContent.text);

    expect(mockPost).toHaveBeenCalledWith('/api/v1/events/event-1/registrations/reg-1/cancel');
    expect(confirmed.success).toBe(true);
    expect(confirmed.registration.status).toBe('cancelled');
  });
});
