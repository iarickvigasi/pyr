/**
 * HTTP client for the PYR backend API.
 * Uses native fetch with X-API-Key authentication.
 */

export interface ApiClient {
  get<T = unknown>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown): Promise<T>;
  del<T = unknown>(path: string): Promise<T>;
}

const DEFAULT_LIMIT = 20;

export function createApiClient(baseUrl: string, apiKey: string): ApiClient {
  const headers: Record<string, string> = {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };

  async function request<T>(method: string, path: string, body?: unknown, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = new URL(path, baseUrl);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    // Cap list requests to avoid blowing up LLM context
    if (method === 'GET' && !url.searchParams.has('limit')) {
      url.searchParams.set('limit', String(DEFAULT_LIMIT));
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`PYR API ${method} ${path} failed (${response.status}): ${text}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const json = await response.json() as { data: T };
    return json.data;
  }

  return {
    get<T = unknown>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
      return request<T>('GET', path, undefined, params);
    },
    post<T = unknown>(path: string, body?: unknown): Promise<T> {
      return request<T>('POST', path, body);
    },
    patch<T = unknown>(path: string, body?: unknown): Promise<T> {
      return request<T>('PATCH', path, body);
    },
    del<T = unknown>(path: string): Promise<T> {
      return request<T>('DELETE', path);
    },
  };
}
