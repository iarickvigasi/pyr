import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, ApiError } from '../api';

// Mock fetch
global.fetch = vi.fn();

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET requests', () => {
    it('should make successful GET request', async () => {
      const mockData = { data: { id: '1', name: 'Test' } };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData,
      });

      const result = await api.get('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/test',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        })
      );
      expect(result).toEqual(mockData);
    });

    it('should include query parameters', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await api.get('/test', {
        params: { foo: 'bar', count: 42, active: true },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/test?foo=bar&count=42&active=true',
        expect.any(Object)
      );
    });

    it('should filter out undefined and empty string params', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await api.get('/test', {
        params: { foo: 'bar', empty: '', undef: undefined },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/test?foo=bar',
        expect.any(Object)
      );
    });
  });

  describe('POST requests', () => {
    it('should make successful POST request with body', async () => {
      const mockResponse = { data: { id: '1' } };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const body = { name: 'Test', value: 123 };
      const result = await api.post('/test', body);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle 204 No Content response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const result = await api.post('/test');

      expect(result).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should throw ApiError on 4xx errors', async () => {
      const errorResponse = {
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
          },
        }),
      };
      (global.fetch as any).mockResolvedValueOnce(errorResponse);
      (global.fetch as any).mockResolvedValueOnce(errorResponse);

      await expect(api.get('/test')).rejects.toThrow(ApiError);
      await expect(api.get('/test')).rejects.toThrow('Invalid input');
    });

    it('should throw ApiError on 5xx errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Server error',
          },
        }),
      });

      await expect(api.get('/test')).rejects.toThrow(ApiError);
    });

    it('should handle malformed error response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(api.get('/test')).rejects.toThrow('Not Found');
    });

    it('should throw ApiError with correct properties', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: {
            code: 'NOT_FOUND',
            message: 'Resource not found',
          },
        }),
      });

      try {
        await api.get('/test');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(404);
        expect((error as ApiError).code).toBe('NOT_FOUND');
        expect((error as ApiError).message).toBe('Resource not found');
      }
    });

    it('should NOT auto-redirect on 401', async () => {
      const originalLocation = window.location.href;

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
          },
        }),
      });

      await expect(api.get('/test')).rejects.toThrow(ApiError);

      // Verify no redirect happened
      expect(window.location.href).toBe(originalLocation);
    });
  });

  describe('Other HTTP methods', () => {
    it('should make PATCH requests', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {} }),
      });

      await api.patch('/test', { field: 'value' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    it('should make PUT requests', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {} }),
      });

      await api.put('/test', { field: 'value' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('should make DELETE requests', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: {} }),
      });

      await api.delete('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('Credentials', () => {
    it('should always send credentials for cookie-based auth', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await api.get('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: 'include' })
      );
    });
  });
});
