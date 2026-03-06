import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, cleanDatabase, getAuthToken } from '../../test/setup.js';
import { createGuest, createRoomType, createRoom } from '../../test/factories.js';

describe('Dashboard Module', () => {
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

  describe('GET /api/v1/dashboard/stats - Dashboard statistics', () => {
    it('should return zero stats when no data exists', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/stats',
        headers: headers(),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual({
        pendingInquiries: 0,
        confirmedBookings: 0,
        checkedInGuests: 0,
        revenueThisMonth: 0,
        totalGuests: 0,
        upcomingEvents: 0,
      });
    });

    it('should count pending inquiries correctly', async () => {
      const guest = await createGuest(app.prisma);
      const roomType = await createRoomType(app.prisma);
      const room = await createRoom(app.prisma, roomType.id);

      // Create inquiry bookings
      await app.prisma.booking.create({
        data: {
          guestId: guest.id,
          roomId: room.id,
          checkIn: new Date('2026-03-15'),
          checkOut: new Date('2026-03-20'),
          status: 'inquiry',
          totalPrice: 50000,
        },
      });

      await app.prisma.booking.create({
        data: {
          guestId: guest.id,
          roomId: room.id,
          checkIn: new Date('2026-04-01'),
          checkOut: new Date('2026-04-05'),
          status: 'inquiry',
          totalPrice: 40000,
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/stats',
        headers: headers(),
      });

      const body = JSON.parse(response.body);
      expect(body.data.pendingInquiries).toBe(2);
    });

    it('should count confirmed bookings correctly', async () => {
      const guest = await createGuest(app.prisma);
      const roomType = await createRoomType(app.prisma);
      const room = await createRoom(app.prisma, roomType.id);

      // Create confirmed bookings
      await app.prisma.booking.createMany({
        data: [
          {
            guestId: guest.id,
            roomId: room.id,
            checkIn: new Date('2026-03-15'),
            checkOut: new Date('2026-03-20'),
            status: 'confirmed',
            totalPrice: 50000,
          },
          {
            guestId: guest.id,
            roomId: room.id,
            checkIn: new Date('2026-04-01'),
            checkOut: new Date('2026-04-05'),
            status: 'confirmed',
            totalPrice: 40000,
          },
          {
            guestId: guest.id,
            roomId: room.id,
            checkIn: new Date('2026-05-01'),
            checkOut: new Date('2026-05-03'),
            status: 'inquiry', // Should not be counted
            totalPrice: 30000,
          },
        ],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/stats',
        headers: headers(),
      });

      const body = JSON.parse(response.body);
      expect(body.data.confirmedBookings).toBe(2);
    });

    it('should count checked-in guests correctly', async () => {
      const guest = await createGuest(app.prisma);
      const roomType = await createRoomType(app.prisma);
      const room = await createRoom(app.prisma, roomType.id);

      await app.prisma.booking.createMany({
        data: [
          {
            guestId: guest.id,
            roomId: room.id,
            checkIn: new Date('2026-02-10'),
            checkOut: new Date('2026-02-15'),
            status: 'checked_in',
            totalPrice: 50000,
          },
          {
            guestId: guest.id,
            roomId: room.id,
            checkIn: new Date('2026-02-12'),
            checkOut: new Date('2026-02-17'),
            status: 'checked_in',
            totalPrice: 60000,
          },
          {
            guestId: guest.id,
            roomId: room.id,
            checkIn: new Date('2026-02-01'),
            checkOut: new Date('2026-02-05'),
            status: 'checked_out', // Should not be counted
            totalPrice: 40000,
          },
        ],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/stats',
        headers: headers(),
      });

      const body = JSON.parse(response.body);
      expect(body.data.checkedInGuests).toBe(2);
    });

    it('should calculate revenue for current month only', async () => {
      const guest = await createGuest(app.prisma);
      const roomType = await createRoomType(app.prisma);
      const room = await createRoom(app.prisma, roomType.id);

      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15); // Mid-month this month
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15); // Last month
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15); // Next month

      await app.prisma.booking.createMany({
        data: [
          {
            guestId: guest.id,
            roomId: room.id,
            checkIn: thisMonth,
            checkOut: new Date(thisMonth.getTime() + 5 * 24 * 60 * 60 * 1000),
            status: 'confirmed',
            totalPrice: 50000, // €500
          },
          {
            guestId: guest.id,
            roomId: room.id,
            checkIn: thisMonth,
            checkOut: new Date(thisMonth.getTime() + 3 * 24 * 60 * 60 * 1000),
            status: 'checked_in',
            totalPrice: 30000, // €300
          },
          {
            guestId: guest.id,
            roomId: room.id,
            checkIn: lastMonth,
            checkOut: new Date(lastMonth.getTime() + 5 * 24 * 60 * 60 * 1000),
            status: 'confirmed',
            totalPrice: 40000, // Should NOT be counted (last month)
          },
          {
            guestId: guest.id,
            roomId: room.id,
            checkIn: nextMonth,
            checkOut: new Date(nextMonth.getTime() + 5 * 24 * 60 * 60 * 1000),
            status: 'confirmed',
            totalPrice: 60000, // Should NOT be counted (next month)
          },
          {
            guestId: guest.id,
            roomId: room.id,
            checkIn: thisMonth,
            checkOut: new Date(thisMonth.getTime() + 2 * 24 * 60 * 60 * 1000),
            status: 'inquiry',
            totalPrice: 20000, // Should NOT be counted (inquiry status)
          },
        ],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/stats',
        headers: headers(),
      });

      const body = JSON.parse(response.body);
      expect(body.data.revenueThisMonth).toBe(80000); // 50000 + 30000
    });

    it('should count total guests excluding deleted', async () => {
      await app.prisma.guest.createMany({
        data: [
          { name: 'Guest 1', email: 'guest1@example.com', language: 'en' },
          { name: 'Guest 2', email: 'guest2@example.com', language: 'en' },
          { name: 'Guest 3', email: 'guest3@example.com', language: 'en', deletedAt: new Date() },
        ],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/stats',
        headers: headers(),
      });

      const body = JSON.parse(response.body);
      expect(body.data.totalGuests).toBe(2);
    });

    it('should count upcoming events only', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      await app.prisma.event.createMany({
        data: [
          {
            type: 'puppy_yoga',
            title: 'Past Event',
            date: yesterday,
            time: '10:00',
            capacity: 8,
          },
          {
            type: 'puppy_yoga',
            title: 'Today Event',
            date: today,
            time: '14:00',
            capacity: 8,
          },
          {
            type: 'beach_walk',
            title: 'Future Event',
            date: tomorrow,
            time: '09:00',
            capacity: 10,
          },
        ],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/stats',
        headers: headers(),
      });

      const body = JSON.parse(response.body);
      expect(body.data.upcomingEvents).toBe(2); // Today + tomorrow
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/stats',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should work with API key authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/stats',
        headers: { 'x-api-key': process.env.API_KEY || 'test-api-key' },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("GET /api/v1/dashboard/today - Today's activity", () => {
    it('should return empty arrays when no activity today', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/today',
        headers: headers(),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual({
        checkIns: [],
        checkOuts: [],
        events: [],
      });
    });

    it("should return today's check-ins", async () => {
      const guest = await createGuest(app.prisma, { name: 'John Doe' });
      const roomType = await createRoomType(app.prisma);
      const room = await createRoom(app.prisma, roomType.id, { name: 'Room 101' });

      const today = new Date();
      const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

      await app.prisma.booking.create({
        data: {
          guestId: guest.id,
          roomId: room.id,
          checkIn: todayUTC,
          checkOut: new Date(todayUTC.getTime() + 5 * 24 * 60 * 60 * 1000),
          status: 'confirmed',
          totalPrice: 50000,
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/today',
        headers: headers(),
      });

      const body = JSON.parse(response.body);
      expect(body.data.checkIns).toHaveLength(1);
      expect(body.data.checkIns[0].guestNames).toEqual(['John Doe']);
      expect(body.data.checkIns[0].roomName).toBe('Room 101');
    });

    it("should return today's check-outs", async () => {
      const guest = await createGuest(app.prisma, { name: 'Jane Smith' });
      const roomType = await createRoomType(app.prisma);
      const room = await createRoom(app.prisma, roomType.id, { name: 'Room 202' });

      const today = new Date();
      const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
      const fiveDaysAgo = new Date(todayUTC.getTime() - 5 * 24 * 60 * 60 * 1000);

      await app.prisma.booking.create({
        data: {
          guestId: guest.id,
          roomId: room.id,
          checkIn: fiveDaysAgo,
          checkOut: todayUTC,
          status: 'checked_in',
          totalPrice: 50000,
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/today',
        headers: headers(),
      });

      const body = JSON.parse(response.body);
      expect(body.data.checkOuts).toHaveLength(1);
      expect(body.data.checkOuts[0].guestNames).toEqual(['Jane Smith']);
      expect(body.data.checkOuts[0].roomName).toBe('Room 202');
    });

    it("should return today's events with attendee-aware registration count", async () => {
      const guest1 = await createGuest(app.prisma);
      const guest2 = await createGuest(app.prisma);

      const today = new Date();
      const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

      const event = await app.prisma.event.create({
        data: {
          type: 'puppy_yoga',
          title: 'Morning Yoga',
          date: todayUTC,
          time: '10:00',
          capacity: 8,
        },
      });

      // Register 2 guests
      await app.prisma.eventBooking.createMany({
        data: [
          { eventId: event.id, guestId: guest1.id, status: 'confirmed', attendeeCount: 2 },
          { eventId: event.id, guestId: guest2.id, status: 'confirmed', attendeeCount: 1 },
        ],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/today',
        headers: headers(),
      });

      const body = JSON.parse(response.body);
      expect(body.data.events).toHaveLength(1);
      expect(body.data.events[0].title).toBe('Morning Yoga');
      expect(body.data.events[0].capacity).toBe(8);
      expect(body.data.events[0].registeredCount).toBe(3);
    });

    it('should order events by time', async () => {
      const today = new Date();
      const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

      await app.prisma.event.createMany({
        data: [
          {
            type: 'puppy_yoga',
            title: 'Afternoon Session',
            date: todayUTC,
            time: '14:00',
            capacity: 8,
          },
          {
            type: 'beach_walk',
            title: 'Morning Walk',
            date: todayUTC,
            time: '08:00',
            capacity: 10,
          },
          {
            type: 'coffee_cake_cuddles',
            title: 'Evening Cuddles',
            date: todayUTC,
            time: '18:00',
            capacity: 6,
          },
        ],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/today',
        headers: headers(),
      });

      const body = JSON.parse(response.body);
      expect(body.data.events).toHaveLength(3);
      expect(body.data.events[0].time).toBe('08:00');
      expect(body.data.events[1].time).toBe('14:00');
      expect(body.data.events[2].time).toBe('18:00');
    });

    it('should not include deleted bookings', async () => {
      const guest = await createGuest(app.prisma);
      const roomType = await createRoomType(app.prisma);
      const room = await createRoom(app.prisma, roomType.id);

      const today = new Date();
      const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

      await app.prisma.booking.create({
        data: {
          guestId: guest.id,
          roomId: room.id,
          checkIn: todayUTC,
          checkOut: new Date(todayUTC.getTime() + 5 * 24 * 60 * 60 * 1000),
          status: 'confirmed',
          totalPrice: 50000,
          deletedAt: new Date(), // Deleted
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/today',
        headers: headers(),
      });

      const body = JSON.parse(response.body);
      expect(body.data.checkIns).toHaveLength(0);
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/today',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should work with API key authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/today',
        headers: { 'x-api-key': process.env.API_KEY || 'test-api-key' },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
