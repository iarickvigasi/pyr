import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, cleanDatabase, getAuthToken, seedAdmin } from '../../test/setup.js';

describe('Auth API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return token and user with valid credentials', async () => {
      await seedAdmin();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'test@example.com', password: 'testpass123' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.token).toBeDefined();
      expect(body.user.email).toBe('test@example.com');
      expect(body.user.name).toBe('Test Admin');
      expect(body.user.id).toBe('test_admin');
    });

    it('should return 401 for wrong password', async () => {
      await seedAdmin();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'test@example.com', password: 'wrongpassword' },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for non-existent email', async () => {
      await seedAdmin();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'nobody@example.com', password: 'testpass123' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should return 400 for empty password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'test@example.com', password: '' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return same error message for wrong email and wrong password', async () => {
      await seedAdmin();

      const wrongPassword = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'test@example.com', password: 'wrong' },
      });

      const wrongEmail = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'nobody@example.com', password: 'testpass123' },
      });

      const body1 = JSON.parse(wrongPassword.body);
      const body2 = JSON.parse(wrongEmail.body);
      expect(body1.error.message).toBe(body2.error.message);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return user with valid JWT', async () => {
      const token = await getAuthToken(app);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.email).toBe('test@example.com');
      expect(body.name).toBe('Test Admin');
    });

    it('should return 401 without auth header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      });

      expect(res.statusCode).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: 'Bearer invalid.token.here' },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('API Key auth', () => {
    it('should authenticate with valid API key', async () => {
      const token = await getAuthToken(app);

      // Create a guest to verify API key works for a protected route
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/guests',
        headers: { 'x-api-key': process.env.API_KEY! },
      });

      expect(res.statusCode).toBe(200);
    });

    it('should return 401 with invalid API key', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/guests',
        headers: { 'x-api-key': 'invalid-key' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should work without JWT when using API key', async () => {
      // No Bearer token, only API key
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/guests',
        headers: { 'x-api-key': process.env.API_KEY! },
      });

      expect(res.statusCode).toBe(200);
    });
  });
});
