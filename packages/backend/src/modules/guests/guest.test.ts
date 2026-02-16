import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, cleanDatabase, getAuthToken, prisma } from '../../test/setup.js';

describe('Guests API', () => {
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

  describe('POST /api/v1/guests', () => {
    it('should create a guest', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/guests',
        headers: headers(),
        payload: { name: 'John Doe', email: 'john@example.com', language: 'en' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.name).toBe('John Doe');
      expect(body.data.email).toBe('john@example.com');
    });

    it('should reject duplicate email', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/guests',
        headers: headers(),
        payload: { name: 'John Doe', email: 'john@example.com' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/guests',
        headers: headers(),
        payload: { name: 'Jane Doe', email: 'john@example.com' },
      });

      expect(res.statusCode).toBe(409);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/guests',
        payload: { name: 'John Doe' },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/guests', () => {
    it('should return paginated list', async () => {
      await app.inject({ method: 'POST', url: '/api/v1/guests', headers: headers(), payload: { name: 'Alice' } });
      await app.inject({ method: 'POST', url: '/api/v1/guests', headers: headers(), payload: { name: 'Bob' } });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/guests',
        headers: headers(),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(2);
      expect(body.hasMore).toBe(false);
    });

    it('should search by name', async () => {
      await app.inject({ method: 'POST', url: '/api/v1/guests', headers: headers(), payload: { name: 'Alice Smith' } });
      await app.inject({ method: 'POST', url: '/api/v1/guests', headers: headers(), payload: { name: 'Bob Jones' } });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/guests?search=alice',
        headers: headers(),
      });

      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('Alice Smith');
    });

    it('should not return soft-deleted guests', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/guests', headers: headers(),
        payload: { name: 'ToDelete' },
      });
      const id = JSON.parse(createRes.body).data.id;

      await app.inject({ method: 'DELETE', url: `/api/v1/guests/${id}`, headers: headers() });

      const res = await app.inject({ method: 'GET', url: '/api/v1/guests', headers: headers() });
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(0);
    });
  });

  describe('GET /api/v1/guests/:id', () => {
    it('should return guest with counts', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/guests', headers: headers(),
        payload: { name: 'John Doe', email: 'john@example.com' },
      });
      const id = JSON.parse(createRes.body).data.id;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/guests/${id}`,
        headers: headers(),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.name).toBe('John Doe');
      expect(body.data._count).toBeDefined();
    });

    it('should return 404 for non-existent guest', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/guests/nonexistent',
        headers: headers(),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v1/guests/:id', () => {
    it('should update guest and create audit log', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/guests', headers: headers(),
        payload: { name: 'John Doe' },
      });
      const id = JSON.parse(createRes.body).data.id;

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/guests/${id}`,
        headers: headers(),
        payload: { name: 'John Updated', tags: ['vip'] },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.name).toBe('John Updated');
      expect(body.data.tags).toEqual(['vip']);

      // Verify audit log
      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'guest', entityId: id, action: 'update' },
      });
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('DELETE /api/v1/guests/:id', () => {
    it('should soft-delete guest', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/guests', headers: headers(),
        payload: { name: 'John Doe' },
      });
      const id = JSON.parse(createRes.body).data.id;

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/guests/${id}`,
        headers: headers(),
      });

      expect(res.statusCode).toBe(204);

      // Verify it's soft-deleted (not in list, but in DB)
      const guest = await prisma.guest.findUnique({ where: { id } });
      expect(guest?.deletedAt).not.toBeNull();
    });
  });

  describe('POST /api/v1/guests/merge', () => {
    it('should merge two guests', async () => {
      const res1 = await app.inject({
        method: 'POST', url: '/api/v1/guests', headers: headers(),
        payload: { name: 'Primary Guest', tags: ['tag1'] },
      });
      const res2 = await app.inject({
        method: 'POST', url: '/api/v1/guests', headers: headers(),
        payload: { name: 'Secondary Guest', tags: ['tag2'] },
      });
      const primaryId = JSON.parse(res1.body).data.id;
      const secondaryId = JSON.parse(res2.body).data.id;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/guests/merge',
        headers: headers(),
        payload: { primaryId, secondaryId },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.tags).toContain('tag1');
      expect(body.data.tags).toContain('tag2');

      // Secondary should be soft-deleted
      const secondary = await prisma.guest.findUnique({ where: { id: secondaryId } });
      expect(secondary?.deletedAt).not.toBeNull();
    });

    it('should move bookings and conversations from secondary to primary', async () => {
      // Create two guests
      const res1 = await app.inject({
        method: 'POST', url: '/api/v1/guests', headers: headers(),
        payload: { name: 'Primary' },
      });
      const res2 = await app.inject({
        method: 'POST', url: '/api/v1/guests', headers: headers(),
        payload: { name: 'Secondary' },
      });
      const primaryId = JSON.parse(res1.body).data.id;
      const secondaryId = JSON.parse(res2.body).data.id;

      // Create a conversation for the secondary guest
      await app.inject({
        method: 'POST', url: '/api/v1/conversations', headers: headers(),
        payload: { guestId: secondaryId, channel: 'email' },
      });

      // Merge
      await app.inject({
        method: 'POST', url: '/api/v1/guests/merge', headers: headers(),
        payload: { primaryId, secondaryId },
      });

      // Verify conversations were moved
      const conversations = await prisma.conversation.findMany({ where: { guestId: primaryId } });
      expect(conversations).toHaveLength(1);
    });
  });

  describe('Edge cases', () => {
    it('should support cursor pagination', async () => {
      // Create 3 guests
      await app.inject({ method: 'POST', url: '/api/v1/guests', headers: headers(), payload: { name: 'A' } });
      await app.inject({ method: 'POST', url: '/api/v1/guests', headers: headers(), payload: { name: 'B' } });
      await app.inject({ method: 'POST', url: '/api/v1/guests', headers: headers(), payload: { name: 'C' } });

      // Get first page with limit=2
      const page1 = await app.inject({
        method: 'GET', url: '/api/v1/guests?limit=2', headers: headers(),
      });
      const body1 = JSON.parse(page1.body);
      expect(body1.data).toHaveLength(2);
      expect(body1.hasMore).toBe(true);
      expect(body1.nextCursor).toBeDefined();

      // Get second page
      const page2 = await app.inject({
        method: 'GET', url: `/api/v1/guests?limit=2&cursor=${body1.nextCursor}`, headers: headers(),
      });
      const body2 = JSON.parse(page2.body);
      expect(body2.data).toHaveLength(1);
      expect(body2.hasMore).toBe(false);
    });

    it('should filter by tag', async () => {
      await app.inject({ method: 'POST', url: '/api/v1/guests', headers: headers(), payload: { name: 'VIP', tags: ['vip'] } });
      await app.inject({ method: 'POST', url: '/api/v1/guests', headers: headers(), payload: { name: 'Regular' } });

      const res = await app.inject({
        method: 'GET', url: '/api/v1/guests?tag=vip', headers: headers(),
      });
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('VIP');
    });

    it('should filter by source', async () => {
      await app.inject({ method: 'POST', url: '/api/v1/guests', headers: headers(), payload: { name: 'Web Guest', source: 'website' } });
      await app.inject({ method: 'POST', url: '/api/v1/guests', headers: headers(), payload: { name: 'IG Guest', source: 'instagram' } });

      const res = await app.inject({
        method: 'GET', url: '/api/v1/guests?source=website', headers: headers(),
      });
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('Web Guest');
    });

    it('should reject duplicate email on update', async () => {
      await app.inject({ method: 'POST', url: '/api/v1/guests', headers: headers(), payload: { name: 'Alice', email: 'alice@test.com' } });
      const res2 = await app.inject({ method: 'POST', url: '/api/v1/guests', headers: headers(), payload: { name: 'Bob', email: 'bob@test.com' } });
      const bobId = JSON.parse(res2.body).data.id;

      const res = await app.inject({
        method: 'PATCH', url: `/api/v1/guests/${bobId}`, headers: headers(),
        payload: { email: 'alice@test.com' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('should return 404 when updating non-existent guest', async () => {
      const res = await app.inject({
        method: 'PATCH', url: '/api/v1/guests/nonexistent', headers: headers(),
        payload: { name: 'Updated' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 when deleting non-existent guest', async () => {
      const res = await app.inject({
        method: 'DELETE', url: '/api/v1/guests/nonexistent', headers: headers(),
      });
      expect(res.statusCode).toBe(404);
    });

    it('should create audit log on guest creation', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/guests', headers: headers(),
        payload: { name: 'Audited Guest' },
      });
      const id = JSON.parse(createRes.body).data.id;

      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'guest', entityId: id, action: 'create' },
      });
      expect(logs).toHaveLength(1);
    });

    it('should reject merging a guest with itself', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/guests', headers: headers(),
        payload: { name: 'Solo' },
      });
      const id = JSON.parse(createRes.body).data.id;

      const res = await app.inject({
        method: 'POST', url: '/api/v1/guests/merge', headers: headers(),
        payload: { primaryId: id, secondaryId: id },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
