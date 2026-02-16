import type { FastifyInstance } from 'fastify';

type InjectHeaders = Record<string, string>;

function authHeaders(token: string): InjectHeaders {
  return { authorization: `Bearer ${token}` };
}

function parseBody(res: { body: string }): Record<string, unknown> {
  return JSON.parse(res.body) as Record<string, unknown>;
}

/** Create a guest via API. Returns `{ id, body }`. */
export async function createTestGuest(
  app: FastifyInstance,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/guests',
    headers: authHeaders(token),
    payload: { name: 'Test Guest', ...overrides },
  });
  const body = parseBody(res);
  const data = body.data as Record<string, unknown>;
  return { id: data.id as string, body: data };
}

/** Create a room type via API. Returns `{ id, body }`. */
export async function createTestRoomType(
  app: FastifyInstance,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/room-types',
    headers: authHeaders(token),
    payload: { name: `Room Type ${Date.now()}`, basePrice: 10000, maxOccupancy: 2, ...overrides },
  });
  const body = parseBody(res);
  const data = body.data as Record<string, unknown>;
  return { id: data.id as string, body: data };
}

/** Create a room via API. Returns `{ id, body }`. */
export async function createTestRoom(
  app: FastifyInstance,
  token: string,
  roomTypeId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/rooms',
    headers: authHeaders(token),
    payload: { roomTypeId, name: `Room ${Date.now()}`, ...overrides },
  });
  const body = parseBody(res);
  const data = body.data as Record<string, unknown>;
  return { id: data.id as string, body: data };
}

/** Create a season via API. Returns `{ id, body }`. */
export async function createTestSeason(
  app: FastifyInstance,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/seasons',
    headers: authHeaders(token),
    payload: { name: 'Test Season', startDate: '2026-06-01', endDate: '2026-09-30', priceMultiplier: 1.5, ...overrides },
  });
  const body = parseBody(res);
  const data = body.data as Record<string, unknown>;
  return { id: data.id as string, body: data };
}

/** Create a booking via API. Auto-creates guest + room if not provided. Returns `{ id, body }`. */
export async function createTestBooking(
  app: FastifyInstance,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; body: Record<string, unknown> }> {
  let guestId = overrides.guestId as string | undefined;
  let roomId = overrides.roomId as string | undefined;

  if (!guestId) {
    const guest = await createTestGuest(app, token);
    guestId = guest.id;
  }
  if (!roomId) {
    const rt = await createTestRoomType(app, token);
    const room = await createTestRoom(app, token, rt.id);
    roomId = room.id;
  }

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/bookings',
    headers: authHeaders(token),
    payload: {
      guestId,
      roomId,
      checkIn: '2026-04-01',
      checkOut: '2026-04-05',
      totalPrice: 40000,
      ...overrides,
    },
  });
  const body = parseBody(res);
  const data = body.data as Record<string, unknown>;
  return { id: data.id as string, body: data };
}

/** Create an event via API. Returns `{ id, body }`. */
export async function createTestEvent(
  app: FastifyInstance,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/events',
    headers: authHeaders(token),
    payload: {
      type: 'puppy_yoga',
      title: 'Test Yoga',
      date: '2026-04-01',
      time: '09:00',
      capacity: 8,
      ...overrides,
    },
  });
  const body = parseBody(res);
  const data = body.data as Record<string, unknown>;
  return { id: data.id as string, body: data };
}

/** Create a conversation via API. Auto-creates guest if not provided. Returns `{ id, body }`. */
export async function createTestConversation(
  app: FastifyInstance,
  token: string,
  guestId?: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; body: Record<string, unknown> }> {
  if (!guestId) {
    const guest = await createTestGuest(app, token);
    guestId = guest.id;
  }

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/conversations',
    headers: authHeaders(token),
    payload: { guestId, channel: 'email', ...overrides },
  });
  const body = parseBody(res);
  const data = body.data as Record<string, unknown>;
  return { id: data.id as string, body: data };
}

/** Add a message to a conversation via API. Returns `{ id, body }`. */
export async function addTestMessage(
  app: FastifyInstance,
  token: string,
  conversationId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/conversations/${conversationId}/messages`,
    headers: authHeaders(token),
    payload: { direction: 'in', content: 'Test message', channel: 'email', ...overrides },
  });
  const body = parseBody(res);
  const data = body.data as Record<string, unknown>;
  return { id: data.id as string, body: data };
}

/** Create a full booking setup: guest, room type, 2 rooms. Returns all IDs. */
export async function createFullBookingSetup(
  app: FastifyInstance,
  token: string,
): Promise<{ guestId: string; roomTypeId: string; roomId: string; roomId2: string }> {
  const guest = await createTestGuest(app, token, { email: 'setup@test.com' });
  const rt = await createTestRoomType(app, token, { name: 'Setup Room Type' });
  const room = await createTestRoom(app, token, rt.id, { name: 'Room A' });
  const room2 = await createTestRoom(app, token, rt.id, { name: 'Room B' });

  return { guestId: guest.id, roomTypeId: rt.id, roomId: room.id, roomId2: room2.id };
}
