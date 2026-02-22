import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, cleanDatabase, getAuthToken } from '../../test/setup.js';

describe('Assistant Module', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await getTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    token = await getAuthToken(app);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const headers = () => ({ authorization: `Bearer ${token}` });

  describe('POST /api/v1/assistant/chat - Send message to AI assistant', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/assistant/chat',
        payload: { message: 'Hello', sessionKey: 'dashboard:test' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate request body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/assistant/chat',
        headers: headers(),
        payload: { message: '', sessionKey: 'dashboard:test' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 502 when OpenClaw Gateway is unreachable', async () => {
      // Mock global fetch to simulate connection failure
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new Error('connect ECONNREFUSED 127.0.0.1:18789'),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/assistant/chat',
        headers: headers(),
        payload: { message: 'Hello Koda', sessionKey: 'dashboard:test' },
      });

      expect(response.statusCode).toBe(502);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('OPENCLAW_ERROR');
      expect(body.error.message).toContain('connection failed');

      fetchSpy.mockRestore();
    });

    it('should return 502 when OpenClaw Gateway returns non-2xx', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 }),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/assistant/chat',
        headers: headers(),
        payload: { message: 'Hello Koda', sessionKey: 'dashboard:test' },
      });

      expect(response.statusCode).toBe(502);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('OPENCLAW_ERROR');
      expect(body.error.message).toContain('500');

      fetchSpy.mockRestore();
    });

    it('should work with API key authentication', async () => {
      // Mock fetch to reject so we hit the 502 path (proves auth succeeded)
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new Error('connect ECONNREFUSED'),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/assistant/chat',
        headers: { 'x-api-key': process.env.API_KEY || 'test-api-key' },
        payload: { message: 'Hello', sessionKey: 'dashboard:test' },
      });

      // 502 means auth passed but gateway was down -- which is expected
      expect(response.statusCode).toBe(502);

      fetchSpy.mockRestore();
    });
  });

  describe('POST /api/v1/assistant/chat/reset - Reset chat session', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/assistant/chat/reset',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return a new session key', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/assistant/chat/reset',
        headers: headers(),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.sessionKey).toBeDefined();
      expect(body.data.sessionKey).toMatch(/^dashboard:\d+$/);
    });

    it('should return unique session keys on each call', async () => {
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/v1/assistant/chat/reset',
        headers: headers(),
      });
      const body1 = JSON.parse(response1.body);

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 5));

      const response2 = await app.inject({
        method: 'POST',
        url: '/api/v1/assistant/chat/reset',
        headers: headers(),
      });
      const body2 = JSON.parse(response2.body);

      expect(body1.data.sessionKey).not.toBe(body2.data.sessionKey);
    });

    it('should work with API key authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/assistant/chat/reset',
        headers: { 'x-api-key': process.env.API_KEY || 'test-api-key' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.sessionKey).toBeDefined();
    });
  });
});
