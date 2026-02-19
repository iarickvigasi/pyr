import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, cleanDatabase, getAuthToken, prisma } from '../../test/setup.js';

describe('Settings Module', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await getTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase();
    token = await getAuthToken(app);
  });

  const headers = () => ({ authorization: `Bearer ${token}` });

  describe('GET /api/v1/settings - List all settings', () => {
    it('should return empty array when no settings exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/settings',
        headers: headers(),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual([]);
    });

    it('should return all settings ordered by key', async () => {
      // Create settings in random order
      await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { key: 'zebra', value: 'last' },
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { key: 'apple', value: 'first' },
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { key: 'mango', value: 'middle' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/settings',
        headers: headers(),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(3);
      expect(body.data[0].key).toBe('apple');
      expect(body.data[1].key).toBe('mango');
      expect(body.data[2].key).toBe('zebra');
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/settings',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should work with API key authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/settings',
        headers: { 'x-api-key': process.env.API_KEY || 'test-api-key' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/settings/:key - Get setting by key', () => {
    it('should return setting when it exists', async () => {
      // Create setting
      await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { key: 'test_key', value: { foo: 'bar', count: 42 } },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/settings/test_key',
        headers: headers(),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.key).toBe('test_key');
      expect(body.data.value).toEqual({ foo: 'bar', count: 42 });
    });

    it('should return 404 when setting does not exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/settings/nonexistent',
        headers: headers(),
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.message).toContain('nonexistent');
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/settings/test_key',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/settings - Upsert setting', () => {
    it('should create new setting', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: {
          key: 'new_setting',
          value: { enabled: true, threshold: 100 },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.key).toBe('new_setting');
      expect(body.data.value).toEqual({ enabled: true, threshold: 100 });
    });

    it('should update existing setting', async () => {
      // Create initial setting
      await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { key: 'update_test', value: 'initial_value' },
      });

      // Update setting
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { key: 'update_test', value: 'updated_value' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.value).toBe('updated_value');

      // Verify update persisted
      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/settings/update_test',
        headers: headers(),
      });
      const getBody = JSON.parse(getResponse.body);
      expect(getBody.data.value).toBe('updated_value');
    });

    it('should handle different value types', async () => {
      // String value
      const stringResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { key: 'string_setting', value: 'test string' },
      });
      expect(JSON.parse(stringResponse.body).data.value).toBe('test string');

      // Number value
      const numberResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { key: 'number_setting', value: 42 },
      });
      expect(JSON.parse(numberResponse.body).data.value).toBe(42);

      // Boolean value
      const boolResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { key: 'bool_setting', value: true },
      });
      expect(JSON.parse(boolResponse.body).data.value).toBe(true);

      // Array value
      const arrayResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { key: 'array_setting', value: [1, 2, 3] },
      });
      expect(JSON.parse(arrayResponse.body).data.value).toEqual([1, 2, 3]);

      // Object value
      const objectResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { key: 'object_setting', value: { nested: { deep: 'value' } } },
      });
      expect(JSON.parse(objectResponse.body).data.value).toEqual({ nested: { deep: 'value' } });
    });

    it('should create audit log entry on create', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { key: 'audit_test', value: 'test_value' },
      });

      // Use standalone prisma for direct DB assertion (not app.prisma)
      const auditLogs = await prisma.auditLog.findMany({
        where: { entityType: 'setting' },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const lastAudit = auditLogs[auditLogs.length - 1];
      expect(lastAudit?.action).toBe('create');
    });

    it('should create audit log entry on update', async () => {
      // Create
      await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { key: 'audit_update_test', value: 'initial' },
      });

      // Update
      await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { key: 'audit_update_test', value: 'updated' },
      });

      // Use standalone prisma for direct DB assertion (not app.prisma)
      const auditLogs = await prisma.auditLog.findMany({
        where: { entityType: 'setting' },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLogs[0]?.action).toBe('update');
      expect(auditLogs[1]?.action).toBe('create');
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        payload: { key: 'test', value: 'test' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { value: 'missing_key' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should work with API key authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: { 'x-api-key': process.env.API_KEY || 'test-api-key' },
        payload: { key: 'api_key_test', value: 'test_value' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.key).toBe('api_key_test');
    });
  });

  describe('Integration - Settings workflow', () => {
    it('should support full CRUD workflow', async () => {
      // 1. List - should be empty
      let response = await app.inject({
        method: 'GET',
        url: '/api/v1/settings',
        headers: headers(),
      });
      expect(JSON.parse(response.body).data).toHaveLength(0);

      // 2. Create setting
      response = await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { key: 'workflow_test', value: { step: 1 } },
      });
      expect(response.statusCode).toBe(200);

      // 3. Get specific setting
      response = await app.inject({
        method: 'GET',
        url: '/api/v1/settings/workflow_test',
        headers: headers(),
      });
      expect(JSON.parse(response.body).data.value).toEqual({ step: 1 });

      // 4. Update setting
      response = await app.inject({
        method: 'POST',
        url: '/api/v1/settings',
        headers: headers(),
        payload: { key: 'workflow_test', value: { step: 2, completed: true } },
      });
      expect(JSON.parse(response.body).data.value).toEqual({ step: 2, completed: true });

      // 5. List - should have one setting
      response = await app.inject({
        method: 'GET',
        url: '/api/v1/settings',
        headers: headers(),
      });
      expect(JSON.parse(response.body).data).toHaveLength(1);
    });
  });
});
