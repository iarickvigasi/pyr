import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';
import { getPendingAction } from '../lib/confirmation.js';
import { registerDraftTools } from '../tools/drafts.js';
import { registerConversationTools } from '../tools/conversations.js';
import { registerActionTools } from '../tools/actions.js';

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

describe('inbox telegram tools', () => {
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
    registerDraftTools(mock.api, client);
    registerConversationTools(mock.api, client);
    registerActionTools(mock.api, client);
  });

  it('generate_conversation_draft triggers inbox draft generation endpoint', async () => {
    mockPost.mockResolvedValueOnce({
      jobId: 'job-1',
      messageId: 'msg-1',
    });

    const tool = tools.get('generate_conversation_draft');
    expect(tool).toBeDefined();

    const result = await tool!.execute('id', { conversationId: 'conv-1' });
    const content = (result as { content: Array<{ text: string }> }).content[0]!;
    const parsed = JSON.parse(content.text);

    expect(mockPost).toHaveBeenCalledWith('/api/v1/conversations/conv-1/drafts/generate');
    expect(parsed.success).toBe(true);
    expect(parsed.jobId).toBe('job-1');
    expect(parsed.messageId).toBe('msg-1');
  });

  it('analyze_conversation_booking calls booking-analysis endpoint', async () => {
    mockPost.mockResolvedValueOnce({
      status: 'ready',
      reason: 'Booking intent detected',
      classification: 'conversation',
      missingFields: [],
      candidate: {
        checkIn: '2026-03-10',
        checkOut: '2026-03-15',
        totalPrice: 120000,
        currency: 'EUR',
        source: 'email',
        notes: null,
        guest: { name: 'Anna', email: 'anna@example.com', phone: null },
        confidence: 0.91,
      },
    });

    const tool = tools.get('analyze_conversation_booking');
    expect(tool).toBeDefined();

    const result = await tool!.execute('id', { conversationId: 'conv-2' });
    const content = (result as { content: Array<{ text: string }> }).content[0]!;
    const parsed = JSON.parse(content.text);

    expect(mockPost).toHaveBeenCalledWith('/api/v1/conversations/conv-2/booking-analysis');
    expect(parsed.analysis.status).toBe('ready');
    expect(parsed.conversationId).toBe('conv-2');
  });

  it('create_conversation_booking prepares action and confirm_action executes it', async () => {
    mockPost.mockResolvedValueOnce({
      booking: { id: 'booking-1', status: 'inquiry', checkIn: '2026-03-10', checkOut: '2026-03-15' },
      guest: { id: 'guest-1', name: 'Anna', email: 'anna@example.com' },
      conversation: { id: 'conv-3', guestId: 'guest-1' },
    });

    const prepareTool = tools.get('create_conversation_booking');
    const confirmTool = tools.get('confirm_action');
    expect(prepareTool).toBeDefined();
    expect(confirmTool).toBeDefined();

    const payload = {
      guest: { mode: 'create', name: 'Anna', email: 'anna@example.com', language: 'en' },
      booking: {
        roomId: 'room-1',
        checkIn: '2026-03-10',
        checkOut: '2026-03-15',
        totalPrice: 120000,
        status: 'inquiry',
        source: 'telegram',
        notes: 'Prepared from Telegram',
      },
    };

    const prepareResult = await prepareTool!.execute('id', {
      conversationId: 'conv-3',
      payload,
    });
    const prepareContent = (prepareResult as { content: Array<{ text: string }> }).content[0]!;
    const prepared = JSON.parse(prepareContent.text) as { actionId: string };

    expect(prepared.actionId).toBeTruthy();
    const pending = getPendingAction(prepared.actionId);
    expect(pending?.type).toBe('create_conversation_booking');

    const confirmResult = await confirmTool!.execute('id', { actionId: prepared.actionId });
    const confirmContent = (confirmResult as { content: Array<{ text: string }> }).content[0]!;
    const confirmed = JSON.parse(confirmContent.text);

    expect(mockPost).toHaveBeenCalledWith('/api/v1/conversations/conv-3/bookings', payload);
    expect(confirmed.success).toBe(true);
    expect(confirmed.booking.id).toBe('booking-1');
  });

  it('approve_draft pending action executes approve endpoint with empty object body', async () => {
    mockGet.mockResolvedValueOnce({
      id: 'conv-9',
      subject: 'Re: Testing Notifications',
      status: 'open',
      guest: { id: 'guest-9', name: 'Arick Vigas', email: 'iarick.vigasi@gmail.com' },
    });
    mockPost.mockResolvedValueOnce({
      messageId: '<sent-1@example.com>',
      sentAt: '2026-03-05T12:50:00.000Z',
    });

    const prepareTool = tools.get('approve_draft');
    const confirmTool = tools.get('confirm_action');
    expect(prepareTool).toBeDefined();
    expect(confirmTool).toBeDefined();

    const prepareResult = await prepareTool!.execute('id', {
      conversationId: 'conv-9',
      draftId: 'draft-9',
    });
    const prepareContent = (prepareResult as { content: Array<{ text: string }> }).content[0]!;
    const prepared = JSON.parse(prepareContent.text) as { actionId: string };
    expect(prepared.actionId).toBeTruthy();

    const confirmResult = await confirmTool!.execute('id', { actionId: prepared.actionId });
    const confirmContent = (confirmResult as { content: Array<{ text: string }> }).content[0]!;
    const confirmed = JSON.parse(confirmContent.text);

    expect(mockPost).toHaveBeenCalledWith('/api/v1/conversations/conv-9/drafts/draft-9/approve', {});
    expect(confirmed.success).toBe(true);
  });

  it('approve_draft with edited content sends edited content body on confirm', async () => {
    const editedBody = [
      'Hello Arick,',
      '',
      'Thank you for your update.',
      'The total price for your stay is EUR 1,000.',
      '',
      'Warmly,',
      'Ines',
    ].join('\n');

    mockGet.mockResolvedValueOnce({
      id: 'conv-10',
      subject: 'Re: From Arick',
      status: 'open',
      guest: { id: 'guest-10', name: 'Arick Vigas', email: 'iarick.vigasi@gmail.com' },
    });
    mockPost.mockResolvedValueOnce({
      messageId: '<sent-2@example.com>',
      sentAt: '2026-03-05T13:00:00.000Z',
    });

    const prepareTool = tools.get('approve_draft');
    const confirmTool = tools.get('confirm_action');
    expect(prepareTool).toBeDefined();
    expect(confirmTool).toBeDefined();

    const prepareResult = await prepareTool!.execute('id', {
      conversationId: 'conv-10',
      draftId: 'draft-10',
      content: editedBody,
    });
    const prepareContent = (prepareResult as { content: Array<{ text: string }> }).content[0]!;
    const prepared = JSON.parse(prepareContent.text) as { actionId: string };
    expect(prepared.actionId).toBeTruthy();

    const confirmResult = await confirmTool!.execute('id', { actionId: prepared.actionId });
    const confirmContent = (confirmResult as { content: Array<{ text: string }> }).content[0]!;
    const confirmed = JSON.parse(confirmContent.text);

    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/conversations/conv-10/drafts/draft-10/approve',
      { content: editedBody },
    );
    expect(confirmed.success).toBe(true);
  });
});
