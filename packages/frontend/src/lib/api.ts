const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface ApiOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const needle = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === needle);
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('pyr_token');
  }

  private async request<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options;
    let url = `${this.baseUrl}${path}`;

    if (params) {
      const filtered = Object.entries(params).filter(
        ([, v]) => v !== undefined && v !== '',
      );
      if (filtered.length > 0) {
        const searchParams = new URLSearchParams(
          filtered.map(([k, v]) => [k, String(v)]),
        );
        url += `?${searchParams.toString()}`;
      }
    }

    const token = this.getToken();
    const hasBody = fetchOptions.body !== undefined && fetchOptions.body !== null;
    const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
    const headers: Record<string, string> = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options.headers as Record<string, string>) ?? {}),
    };
    if (hasBody && !isFormData && !hasHeader(headers, 'Content-Type')) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const body = await response
        .json()
        .catch(() => ({ error: { message: response.statusText } }));
      const code = body.error?.code ?? 'UNKNOWN';
      const message = body.error?.message ?? 'Request failed';
      if (response.status === 401 && typeof window !== 'undefined') {
        localStorage.removeItem('pyr_token');
        window.location.href = '/login';
      }
      throw new ApiError(response.status, code, message);
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  }

  get<T>(path: string, options?: ApiOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      ...(payload !== undefined ? { body: payload } : {}),
    });
  }

  patch<T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      ...(payload !== undefined ? { body: payload } : {}),
    });
  }

  put<T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      ...(payload !== undefined ? { body: payload } : {}),
    });
  }

  delete<T>(path: string, options?: ApiOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient(API_BASE);
