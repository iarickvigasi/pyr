const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ApiOptions extends RequestInit {
  params?: Record<string, string>;
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
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> ?? {}),
    };

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message ?? 'Request failed');
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  }

  get<T>(path: string, options?: ApiOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body: JSON.stringify(body) });
  }

  patch<T>(path: string, body?: unknown, options?: ApiOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) });
  }

  delete<T>(path: string, options?: ApiOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient(API_BASE);
