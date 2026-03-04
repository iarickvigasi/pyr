import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MotopressClient, MotopressHttpError, MotopressValidationError } from '../client.js';

describe('MotopressClient', () => {
  const baseUrl = 'https://example.com/wp-json/mphb/v1';

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('sends basic auth and parses valid bookings collection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([
        {
          id: 123,
          status: 'confirmed',
          check_in_date: '2026-03-10',
          check_out_date: '2026-03-12',
          customer: { email: 'guest@example.com' },
        },
      ]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = new MotopressClient({
      baseUrl,
      consumerKey: 'ck_test',
      consumerSecret: 'cs_test',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await client.listBookings({ page: 1, per_page: 1, context: 'view' });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(123);

    const [url, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toContain('/bookings?page=1&per_page=1&context=view');
    expect((requestInit.headers as Record<string, string>).Authorization).toMatch(/^Basic\s/);
  });

  it('throws MotopressHttpError on non-2xx responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = new MotopressClient({
      baseUrl,
      consumerKey: 'ck_test',
      consumerSecret: 'cs_test',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const request = client.listBookings();
    await expect(request).rejects.toBeInstanceOf(MotopressHttpError);
    await expect(request).rejects.toMatchObject({ status: 401 });
  });

  it('throws MotopressValidationError when payload schema is invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 'bad-id' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const client = new MotopressClient({
      baseUrl,
      consumerKey: 'ck_test',
      consumerSecret: 'cs_test',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(client.listBookings()).rejects.toBeInstanceOf(MotopressValidationError);
  });

  it('times out slow requests', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockImplementation((_url: URL, requestInit: RequestInit) => new Promise((_resolve, reject) => {
      const signal = requestInit.signal as AbortSignal | undefined;
      signal?.addEventListener('abort', () => {
        const err = new Error('aborted');
        (err as Error & { name: string }).name = 'AbortError';
        reject(err);
      });
    }));

    const client = new MotopressClient({
      baseUrl,
      consumerKey: 'ck_test',
      consumerSecret: 'cs_test',
      timeoutMs: 100,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const promise = client.listBookings();
    const assertion = expect(promise).rejects.toThrow('MotoPress request timeout');
    await vi.advanceTimersByTimeAsync(150);

    await assertion;
  });
});
