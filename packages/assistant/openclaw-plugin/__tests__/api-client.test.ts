import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../lib/api-client.js';

function okResponse<T>(data: T): Response {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Minimal Response test double is sufficient for these assertions.
  return {
    ok: true,
    status: 200,
    json: async () => ({ data }),
  } as Response;
}

describe('api client request headers/body behavior', () => {
  const baseUrl = 'http://localhost:3001';
  const apiKey = 'test-key';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ ok: true })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not send content-type or body for POST without payload', async () => {
    const client = createApiClient(baseUrl, apiKey);
    await client.post('/api/v1/conversations/conv-1/drafts/draft-1/approve');

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/conversations/conv-1/drafts/draft-1/approve',
      {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
      },
    );
  });

  it('sends json body and content-type for POST with payload', async () => {
    const client = createApiClient(baseUrl, apiKey);
    await client.post('/api/v1/agent/confirm', { actionId: 'a-1' });

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/agent/confirm',
      {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ actionId: 'a-1' }),
      },
    );
  });

  it('adds default limit for GET list requests and no content-type header', async () => {
    const client = createApiClient(baseUrl, apiKey);
    await client.get('/api/v1/conversations', { status: 'open' });

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe('http://localhost:3001/api/v1/conversations?status=open&limit=20');
    expect(call[1]).toEqual({
      method: 'GET',
      headers: { 'X-API-Key': apiKey },
    });
  });
});
