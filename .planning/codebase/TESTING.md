# Testing Patterns

**Analysis Date:** 2026-02-19

## Test Framework

**Runner:**
- Backend: Vitest v3.0.4 with Node.js environment
- Frontend: Vitest v3.0.4 with jsdom environment
- Config files: `packages/backend/vitest.config.ts`, `packages/frontend/vitest.config.ts`

**Assertion Library:**
- Vitest built-in (similar to Jest)
- Expect assertions: `expect()` with chainable matchers

**Run Commands:**

Backend:
```bash
pnpm run test                 # Run all tests once
pnpm run test:watch          # Watch mode
npm run db:migrate:test      # Setup test DB (one-time)
npm run db:seed              # Seed development data
```

Frontend:
```bash
pnpm run test                 # Run all tests once
pnpm run test:watch          # Watch mode
pnpm run test:coverage       # Generate coverage report (HTML)
```

## Test File Organization

**Location:**
- Backend: Co-located in modules — `src/modules/<module>/<module>.test.ts`
- Frontend: Co-located with implementation — `src/lib/__tests__/<module>.test.ts` or `src/lib/hooks/__tests__/<hook>.test.ts`

**Naming:**
- Backend: `<module>.test.ts` (one per module)
- Frontend: `<feature>.test.ts` inside `__tests__/` directory

**Structure:**
```
packages/backend/
├── src/
│   ├── test/
│   │   ├── setup.ts          # Test app builder, DB cleanup, factories
│   │   ├── factories.ts      # Helper functions to create test data via API
│   │   └── health.test.ts    # Integration test for /health
│   └── modules/
│       ├── guests/
│       │   ├── guest.routes.ts
│       │   ├── guest.service.ts
│       │   ├── guest.schema.ts
│       │   └── guest.test.ts  # All guest API tests
│       └── [other modules]/

packages/frontend/
├── src/
│   ├── test/
│   │   └── setup.ts          # Cleanup, mocks for Next.js, fetch, router
│   ├── lib/
│   │   ├── __tests__/
│   │   │   ├── api.test.ts
│   │   │   └── format.test.ts
│   │   └── hooks/
│   │       └── __tests__/
│   │           └── use-guests.test.ts
```

## Test Structure

**Suite Organization:**

Backend:
```typescript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, cleanDatabase, getAuthToken, prisma } from '../../test/setup.js';
import { createTestGuest, createTestBooking } from '../../test/factories.js';

describe('Guests API', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await getTestApp();  // Build Fastify app once per suite
  });

  beforeEach(async () => {
    await cleanDatabase();     // Truncate all tables
    token = await getAuthToken(app);  // Get fresh JWT
  });

  describe('POST /api/v1/guests', () => {
    it('should create a guest', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/guests',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'John Doe', email: 'john@example.com', language: 'en' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.name).toBe('John Doe');
    });
  });
});
```

Frontend:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useGuests } from '../use-guests';
import { api } from '@/lib/api';

vi.mock('@/lib/api');  // Mock API module

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useGuests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch guests with filters', async () => {
    const mockResponse = { data: [mockGuest], nextCursor: 'cursor123', hasMore: true };
    vi.mocked(api.get).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useGuests({ search: 'jane' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockResponse);
  });
});
```

**Patterns:**
- Use `describe()` for grouping by endpoint or feature
- Use nested `describe()` for HTTP methods or test scenarios
- Test name starts with verb: "should", "must", "returns"
- One assertion per test is ideal; multiple related assertions acceptable

## Mocking

**Framework:** Vitest built-in `vi` module

**Backend Patterns:**
- No external service mocking needed for integration tests (real DB/Redis)
- Factories create test data via actual API calls
- Use `vi.mock()` for imported modules when testing specific scenarios

**Frontend Patterns:**

Mock API client:
```typescript
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
}));
```

Mock Next.js navigation (in `setup.ts`):
```typescript
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    pathname: '/',
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
```

Mock Next.js Image:
```typescript
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => {
    const { createElement } = require('react');
    return createElement('img', { src, alt });
  },
}));
```

Setup environment variables:
```typescript
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';
```

**What to Mock:**
- External HTTP calls (via `api` mocking)
- Next.js utilities (router, navigation, image)
- Browser APIs if testing SSR-unfriendly code

**What NOT to Mock:**
- React Query client (use real QueryClient with retry disabled)
- Database queries in backend tests (use real test DB)
- Custom hooks (test real behavior, not mocked internals)

## Fixtures and Factories

**Test Data Creation:**

Backend factories (in `src/test/factories.ts`):
```typescript
/** Create a guest via API. Returns `{ id, body }`. */
export async function createTestGuest(
  app: FastifyInstance,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/guests',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Test Guest', email: `guest-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`, ...overrides },
  });
  const body = JSON.parse(res.body);
  const data = body.data as Record<string, unknown>;
  return { id: data.id as string, body: data };
}

/** Create a full booking setup with guest, room type, room. */
export async function createFullBookingSetup(
  app: FastifyInstance,
  token: string,
): Promise<{ guestId: string; roomId: string; roomId2: string }> {
  const guest = await createTestGuest(app, token);
  const rt = await createTestRoomType(app, token);
  const room1 = await createTestRoom(app, token, rt.id);
  const room2 = await createTestRoom(app, token, rt.id);
  return { guestId: guest.id, roomId: room1.id, roomId2: room2.id };
}
```

**Location:**
- Backend: `src/test/factories.ts` — imported in all module tests
- Frontend: Inline mock objects in test files (smaller scale)

**Usage Pattern:**
```typescript
const { id: guestId } = await createTestGuest(app, token);
const { id: bookingId } = await createTestBooking(app, token, { guestId });
```

**Overrides:**
- All factories accept `overrides: Record<string, unknown>`
- Spread into payload: `{ ...overrides }`
- Allows test-specific customization: `createTestGuest(app, token, { language: 'de' })`

## Coverage

**Requirements:** Not enforced in MVP; coverage tracked for quality awareness

**View Coverage:**

Frontend:
```bash
pnpm run test:coverage          # Generate HTML report in `coverage/`
open coverage/index.html        # View in browser
```

**Configuration:**
- Frontend coverage config in `vitest.config.ts`:
  - Provider: v8
  - Reporters: text, json, html
  - Excludes: node_modules, test setup files, types, config files, .next/

## Test Types

**Unit Tests:**
- Scope: Single function or pure utility
- Example: `clampLimit()` in `src/lib/pagination.ts`
- Approach: Direct function calls, simple assertions
- Backend: Limited (prefer integration tests)

**Integration Tests:**
- Scope: API endpoint behavior with real database/redis
- Example: `POST /api/v1/guests` creates guest and audit log
- Approach: Fastify `app.inject()` with real DB
- Setup: `beforeEach()` cleans database, creates auth token
- Cleanup: Automatic via test environment teardown

**E2E Tests:**
- Framework: Not used in MVP
- Status: Deferred to Phase 9

## Common Patterns

**Async Testing:**

Backend (integration):
```typescript
it('should create a guest', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/guests',
    headers: headers(),
    payload: { name: 'John', email: 'john@test.com' },
  });

  expect(res.statusCode).toBe(201);
  const body = JSON.parse(res.body);
  expect(body.data.name).toBe('John');
});
```

Frontend (with React Query):
```typescript
it('should fetch guests', async () => {
  vi.mocked(api.get).mockResolvedValue(mockResponse);

  const { result } = renderHook(() => useGuests({ search: 'jane' }), {
    wrapper: createWrapper(),
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual(mockResponse);
});
```

**Error Testing:**

Backend:
```typescript
it('should return 409 for duplicate email', async () => {
  await app.inject({
    method: 'POST',
    url: '/api/v1/guests',
    headers: headers(),
    payload: { name: 'John', email: 'john@test.com' },
  });

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/guests',
    headers: headers(),
    payload: { name: 'Jane', email: 'john@test.com' },
  });

  expect(res.statusCode).toBe(409);
  const body = JSON.parse(res.body);
  expect(body.error.code).toBe('CONFLICT');
});
```

Frontend:
```typescript
it('should throw ApiError on 400 response', async () => {
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

  await expect(api.get('/test')).rejects.toThrow(ApiError);
  await expect(api.get('/test')).rejects.toThrow('Invalid input');
});
```

**Soft Delete Testing:**

```typescript
it('should not return soft-deleted guests', async () => {
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/v1/guests',
    headers: headers(),
    payload: { name: 'ToDelete', email: 'todelete@test.com' },
  });
  const id = JSON.parse(createRes.body).data.id;

  await app.inject({ method: 'DELETE', url: `/api/v1/guests/${id}`, headers: headers() });

  const res = await app.inject({ method: 'GET', url: '/api/v1/guests', headers: headers() });
  const body = JSON.parse(res.body);
  expect(body.data).toHaveLength(0);

  // Verify it's soft-deleted in DB
  const guest = await prisma.guest.findUnique({ where: { id } });
  expect(guest?.deletedAt).not.toBeNull();
});
```

**Audit Logging Testing:**

```typescript
it('should create audit log on guest creation', async () => {
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/v1/guests',
    headers: headers(),
    payload: { name: 'Audited Guest', email: 'audited@test.com' },
  });
  const id = JSON.parse(createRes.body).data.id;

  const logs = await prisma.auditLog.findMany({
    where: { entityType: 'guest', entityId: id, action: 'create' },
  });
  expect(logs).toHaveLength(1);
  expect(logs[0].actor).toContain('admin:');
});
```

**Cursor Pagination Testing:**

```typescript
it('should support cursor pagination', async () => {
  // Create 3 guests
  await createTestGuest(app, token, { name: 'A', email: 'a@test.com' });
  await createTestGuest(app, token, { name: 'B', email: 'b@test.com' });
  await createTestGuest(app, token, { name: 'C', email: 'c@test.com' });

  // Get first page with limit=2
  const page1 = await app.inject({
    method: 'GET',
    url: '/api/v1/guests?limit=2',
    headers: headers(),
  });
  const body1 = JSON.parse(page1.body);
  expect(body1.data).toHaveLength(2);
  expect(body1.hasMore).toBe(true);
  expect(body1.nextCursor).toBeDefined();

  // Get second page
  const page2 = await app.inject({
    method: 'GET',
    url: `/api/v1/guests?limit=2&cursor=${body1.nextCursor}`,
    headers: headers(),
  });
  const body2 = JSON.parse(page2.body);
  expect(body2.data).toHaveLength(1);
  expect(body2.hasMore).toBe(false);
});
```

## Test Setup & Teardown

**Backend:**

Setup file: `src/test/setup.ts`
```typescript
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll } from 'vitest';
import { buildApp } from '../app.js';

let app: FastifyInstance | null = null;
const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

export async function getTestApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildApp();
    await app.ready();
  }
  return app;
}

export async function cleanDatabase(): Promise<void> {
  const TABLES = [
    'ai_drafts', 'messages', 'conversations', 'event_bookings',
    'calendar_events', 'payments', 'invoices', 'bookings', 'events',
    'rooms', 'room_types', 'seasons', 'guests', 'settings', 'admin_users', 'audit_log',
  ].join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES} CASCADE`);
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
  return testApp.jwt.sign(
    { sub: 'test_admin', role: 'admin' },
    { expiresIn: '1h' },
  );
}

export { prisma };
```

**Frontend:**

Setup file: `src/test/setup.ts`
```typescript
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();  // Cleanup React Testing Library mounts
});

// Mock Next.js router, image, environment variables...
vi.mock('next/navigation', () => ({...}));
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';
```

**Configuration:**

Backend `vitest.config.ts`:
```typescript
export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    env: {
      DATABASE_URL: 'postgresql://pyr:pyr_dev_password@localhost:5432/pyr_test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'test-secret-must-be-at-least-32-characters-long',
      API_KEY: 'test-api-key-for-tests',
      NODE_ENV: 'test',
    },
  },
});
```

---

*Testing analysis: 2026-02-19*
