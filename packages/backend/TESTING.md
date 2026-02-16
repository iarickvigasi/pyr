# Backend Testing Guide

## Prerequisites

- Docker (PostgreSQL + Redis): `docker compose up -d`
- Test database: `docker compose exec postgres psql -U pyr -c "CREATE DATABASE pyr_test"`
- Migration applied: `DATABASE_URL="...pyr_test" pnpm prisma migrate deploy`

## Running Tests

```bash
DATABASE_URL="postgresql://pyr:pyr_dev_password@localhost:5432/pyr_test" \
REDIS_URL="redis://localhost:6379" \
JWT_SECRET="test-secret-key-that-is-long-enough" \
API_KEY="test-api-key-12345" \
NODE_ENV="test" \
LOG_LEVEL="error" \
pnpm --filter @pyr/backend test
```

Or with watch mode: replace `test` with `test:watch`.

## Test Infrastructure

### `src/test/setup.ts`

- `getTestApp()` — builds and caches the Fastify app (one instance per test run)
- `cleanDatabase()` — truncates all tables between tests
- `seedAdmin()` — creates a test admin user
- `getAuthToken(app)` — seeds admin + logs in, returns JWT token

### `src/test/factories.ts`

Reusable factory functions that call API endpoints:

- `createTestGuest(app, token, overrides?)` — creates a guest
- `createTestRoomType(app, token, overrides?)` — creates a room type
- `createTestRoom(app, token, roomTypeId, overrides?)` — creates a room
- `createTestSeason(app, token, overrides?)` — creates a season
- `createTestBooking(app, token, overrides?)` — creates a booking (auto-creates guest + room)
- `createTestEvent(app, token, overrides?)` — creates an event
- `createTestConversation(app, token, guestId?, overrides?)` — creates a conversation
- `addTestMessage(app, token, conversationId, overrides?)` — adds a message
- `createFullBookingSetup(app, token)` — creates guest + room type + 2 rooms

## Test Pattern

```typescript
describe('Module API', () => {
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

  it('should do something', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/resource',
      headers: headers(),
      payload: { ... },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.field).toBe('value');
  });
});
```

## Adding Tests for a New Module

1. Create `src/modules/<name>/<name>.test.ts`
2. Import `getTestApp`, `cleanDatabase`, `getAuthToken` from `../../test/setup.js`
3. Import factories from `../../test/factories.js` as needed
4. Follow the pattern above with `beforeAll` / `beforeEach`
5. Test happy paths, error cases (404, 409, 400), and auth (401)
6. Run `pnpm --filter @pyr/backend test` to verify
