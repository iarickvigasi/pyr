import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { hashPassword } from '../lib/password.js';

let app: FastifyInstance | null = null;
const prisma = new PrismaClient();

export async function getTestApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildApp();
    await app.ready();
  }
  return app;
}

export async function cleanDatabase(): Promise<void> {
  const tablenames = [
    'ai_drafts',
    'messages',
    'conversations',
    'event_bookings',
    'calendar_events',
    'payments',
    'invoices',
    'bookings',
    'events',
    'rooms',
    'room_types',
    'seasons',
    'guests',
    'admin_users',
    'audit_log',
  ];

  for (const table of tablenames) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
}

export async function seedAdmin(): Promise<{ id: string; email: string }> {
  const passwordHash = await hashPassword('testpass123');
  const admin = await prisma.adminUser.create({
    data: {
      id: 'test_admin',
      email: 'test@example.com',
      passwordHash,
      name: 'Test Admin',
    },
  });
  return { id: admin.id, email: admin.email };
}

export async function getAuthToken(testApp: FastifyInstance): Promise<string> {
  await seedAdmin();
  const response = await testApp.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: 'test@example.com', password: 'testpass123' },
  });
  const body = JSON.parse(response.body);
  return body.token;
}

export { prisma };
