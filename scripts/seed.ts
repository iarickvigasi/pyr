import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../packages/backend/src/lib/password.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Seeding database...');

  // ─── Admin User ────────────────────────────────────────
  const adminPassword = await hashPassword('admin123');
  const admin = await prisma.adminUser.upsert({
    where: { email: 'ines@puppyyogaretreat.com' },
    update: {},
    create: {
      id: 'admin_ines',
      email: 'ines@puppyyogaretreat.com',
      passwordHash: adminPassword,
      name: 'Ines Brendel',
    },
  });
  console.log(`  Admin user: ${admin.email}`);

  // ─── Room Types ────────────────────────────────────────
  const roomTypes = await Promise.all([
    prisma.roomType.upsert({
      where: { id: 'rt_private' },
      update: {},
      create: {
        id: 'rt_private',
        name: 'Private Room',
        description: 'Private en-suite room with garden view',
        basePrice: 12000, // €120/night
        maxOccupancy: 2,
      },
    }),
    prisma.roomType.upsert({
      where: { id: 'rt_shared' },
      update: {},
      create: {
        id: 'rt_shared',
        name: 'Shared Room',
        description: 'Shared room with twin beds',
        basePrice: 8000, // €80/night
        maxOccupancy: 2,
      },
    }),
    prisma.roomType.upsert({
      where: { id: 'rt_suite' },
      update: {},
      create: {
        id: 'rt_suite',
        name: 'Villa Suite',
        description: 'Luxury suite with private terrace and sea view',
        basePrice: 18000, // €180/night
        maxOccupancy: 3,
      },
    }),
  ]);
  console.log(`  Room types: ${roomTypes.length}`);

  // ─── Rooms ─────────────────────────────────────────────
  const rooms = await Promise.all([
    prisma.room.upsert({ where: { id: 'room_1' }, update: {}, create: { id: 'room_1', roomTypeId: 'rt_private', name: 'Olive Room' } }),
    prisma.room.upsert({ where: { id: 'room_2' }, update: {}, create: { id: 'room_2', roomTypeId: 'rt_private', name: 'Jasmine Room' } }),
    prisma.room.upsert({ where: { id: 'room_3' }, update: {}, create: { id: 'room_3', roomTypeId: 'rt_shared', name: 'Bougainvillea Room' } }),
    prisma.room.upsert({ where: { id: 'room_4' }, update: {}, create: { id: 'room_4', roomTypeId: 'rt_shared', name: 'Lavender Room' } }),
    prisma.room.upsert({ where: { id: 'room_5' }, update: {}, create: { id: 'room_5', roomTypeId: 'rt_suite', name: 'Sunset Suite' } }),
    prisma.room.upsert({ where: { id: 'room_6' }, update: {}, create: { id: 'room_6', roomTypeId: 'rt_suite', name: 'Sunrise Suite', status: 'maintenance' } }),
  ]);
  console.log(`  Rooms: ${rooms.length}`);

  // ─── Seasons ───────────────────────────────────────────
  const seasons = await Promise.all([
    prisma.season.upsert({
      where: { id: 'season_high' },
      update: {},
      create: {
        id: 'season_high',
        name: 'High Season (Summer)',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-09-30'),
        priceMultiplier: 1.5,
      },
    }),
    prisma.season.upsert({
      where: { id: 'season_low' },
      update: {},
      create: {
        id: 'season_low',
        name: 'Low Season (Winter)',
        startDate: new Date('2026-11-01'),
        endDate: new Date('2027-02-28'),
        priceMultiplier: 0.8,
      },
    }),
  ]);
  console.log(`  Seasons: ${seasons.length}`);

  // ─── Guests ────────────────────────────────────────────
  const guests = await Promise.all([
    prisma.guest.upsert({
      where: { id: 'guest_1' }, update: {},
      create: { id: 'guest_1', name: 'Sarah Johnson', email: 'sarah.j@example.com', phone: '+44 7700 900123', language: 'en', source: 'website', tags: ['returning', 'yoga-lover'], notes: 'Vegetarian, prefers morning sessions' },
    }),
    prisma.guest.upsert({
      where: { id: 'guest_2' }, update: {},
      create: { id: 'guest_2', name: 'Anna Mueller', email: 'anna.m@example.de', phone: '+49 170 1234567', language: 'de', source: 'instagram', tags: ['first-time'], dietaryNeeds: 'Gluten-free' },
    }),
    prisma.guest.upsert({
      where: { id: 'guest_3' }, update: {},
      create: { id: 'guest_3', name: 'Emma Wilson', email: 'emma.w@example.com', language: 'en', source: 'gyg', tags: ['event-only'] },
    }),
    prisma.guest.upsert({
      where: { id: 'guest_4' }, update: {},
      create: { id: 'guest_4', name: 'Thomas Schmidt', email: 'thomas.s@example.de', phone: '+49 151 9876543', language: 'de', source: 'bookretreats', tags: ['retreat', 'returning'] },
    }),
    prisma.guest.upsert({
      where: { id: 'guest_5' }, update: {},
      create: { id: 'guest_5', name: 'Lisa Brown', email: 'lisa.b@example.com', language: 'en', source: 'email', tags: ['retreat'] },
    }),
    prisma.guest.upsert({
      where: { id: 'guest_6' }, update: {},
      create: { id: 'guest_6', name: 'Max Weber', email: 'max.w@example.de', language: 'de', source: 'instagram', tags: ['event-only', 'puppy-lover'] },
    }),
    prisma.guest.upsert({
      where: { id: 'guest_7' }, update: {},
      create: { id: 'guest_7', name: 'Claire Dubois', email: 'claire.d@example.fr', language: 'en', source: 'viator', tags: ['first-time'] },
    }),
    prisma.guest.upsert({
      where: { id: 'guest_8' }, update: {},
      create: { id: 'guest_8', name: 'Julia Becker', email: 'julia.b@example.de', phone: '+49 160 1112233', language: 'de', source: 'tripaneer', tags: ['retreat', 'yoga-lover'] },
    }),
  ]);
  console.log(`  Guests: ${guests.length}`);

  // ─── Bookings ──────────────────────────────────────────
  const bookings = await Promise.all([
    prisma.booking.upsert({
      where: { id: 'booking_1' }, update: {},
      create: { id: 'booking_1', guestId: 'guest_1', roomId: 'room_1', checkIn: new Date('2026-03-15'), checkOut: new Date('2026-03-19'), status: 'confirmed', totalPrice: 48000, source: 'website', notes: '4-day retreat' },
    }),
    prisma.booking.upsert({
      where: { id: 'booking_2' }, update: {},
      create: { id: 'booking_2', guestId: 'guest_2', roomId: 'room_3', checkIn: new Date('2026-03-15'), checkOut: new Date('2026-03-22'), status: 'confirmed', totalPrice: 56000, source: 'instagram', notes: '7-day retreat' },
    }),
    prisma.booking.upsert({
      where: { id: 'booking_3' }, update: {},
      create: { id: 'booking_3', guestId: 'guest_4', roomId: 'room_5', checkIn: new Date('2026-04-01'), checkOut: new Date('2026-04-05'), status: 'inquiry', totalPrice: 72000, source: 'bookretreats' },
    }),
    prisma.booking.upsert({
      where: { id: 'booking_4' }, update: {},
      create: { id: 'booking_4', guestId: 'guest_5', roomId: 'room_2', checkIn: new Date('2026-03-20'), checkOut: new Date('2026-03-27'), status: 'inquiry', totalPrice: 84000, source: 'email' },
    }),
    prisma.booking.upsert({
      where: { id: 'booking_5' }, update: {},
      create: { id: 'booking_5', guestId: 'guest_8', roomId: 'room_4', checkIn: new Date('2026-02-01'), checkOut: new Date('2026-02-05'), status: 'checked_out', totalPrice: 32000, source: 'tripaneer' },
    }),
  ]);
  console.log(`  Bookings: ${bookings.length}`);

  // ─── Events ────────────────────────────────────────────
  const events = await Promise.all([
    prisma.event.upsert({
      where: { id: 'event_1' }, update: {},
      create: { id: 'event_1', type: 'puppy_yoga', title: 'Sunrise Puppy Yoga', date: new Date('2026-03-16'), time: '07:30', capacity: 8, location: 'Rooftop Terrace', description: '90-minute yoga session with our rescue puppies' },
    }),
    prisma.event.upsert({
      where: { id: 'event_2' }, update: {},
      create: { id: 'event_2', type: 'beach_walk', title: 'Puppy Beach Walk — Coral Bay', date: new Date('2026-03-17'), time: '09:00', capacity: 12, location: 'Coral Bay Beach', description: 'Morning walk along Coral Bay with the puppies' },
    }),
    prisma.event.upsert({
      where: { id: 'event_3' }, update: {},
      create: { id: 'event_3', type: 'coffee_cake_cuddles', title: 'Coffee, Cake & Cuddles', date: new Date('2026-03-18'), time: '15:00', capacity: 10, location: 'Garden Lounge', description: 'Afternoon tea with homemade cake and puppy cuddles' },
    }),
  ]);
  console.log(`  Events: ${events.length}`);

  // ─── Event Registrations ───────────────────────────────
  // Register several guests for the yoga event (testing capacity)
  const registrations = await Promise.all([
    prisma.eventBooking.upsert({ where: { eventId_guestId: { eventId: 'event_1', guestId: 'guest_1' } }, update: {}, create: { eventId: 'event_1', guestId: 'guest_1', status: 'confirmed' } }),
    prisma.eventBooking.upsert({ where: { eventId_guestId: { eventId: 'event_1', guestId: 'guest_2' } }, update: {}, create: { eventId: 'event_1', guestId: 'guest_2', status: 'confirmed' } }),
    prisma.eventBooking.upsert({ where: { eventId_guestId: { eventId: 'event_1', guestId: 'guest_3' } }, update: {}, create: { eventId: 'event_1', guestId: 'guest_3', status: 'confirmed' } }),
    prisma.eventBooking.upsert({ where: { eventId_guestId: { eventId: 'event_2', guestId: 'guest_1' } }, update: {}, create: { eventId: 'event_2', guestId: 'guest_1', status: 'confirmed' } }),
    prisma.eventBooking.upsert({ where: { eventId_guestId: { eventId: 'event_2', guestId: 'guest_6' } }, update: {}, create: { eventId: 'event_2', guestId: 'guest_6', status: 'confirmed' } }),
    prisma.eventBooking.upsert({ where: { eventId_guestId: { eventId: 'event_3', guestId: 'guest_7' } }, update: {}, create: { eventId: 'event_3', guestId: 'guest_7', status: 'confirmed' } }),
  ]);
  console.log(`  Event registrations: ${registrations.length}`);

  // ─── Conversations & Messages ──────────────────────────
  const conv1 = await prisma.conversation.upsert({
    where: { id: 'conv_1' }, update: {},
    create: { id: 'conv_1', guestId: 'guest_1', channel: 'email', subject: 'Booking Inquiry — March Retreat', status: 'open', lastMessageAt: new Date('2026-02-14T10:30:00Z') },
  });

  await prisma.message.upsert({
    where: { id: 'msg_1' }, update: {},
    create: { id: 'msg_1', conversationId: 'conv_1', direction: 'in', content: 'Hi Ines! I would love to book the March retreat. Do you still have private rooms available?', channel: 'email', sentAt: new Date('2026-02-14T08:00:00Z') },
  });
  await prisma.message.upsert({
    where: { id: 'msg_2' }, update: {},
    create: { id: 'msg_2', conversationId: 'conv_1', direction: 'out', content: 'Hello Sarah! Thank you for your interest. Yes, we still have the Olive Room and Jasmine Room available for March 15-19. Would you like me to reserve one for you?', channel: 'email', sentAt: new Date('2026-02-14T10:30:00Z') },
  });

  const conv2 = await prisma.conversation.upsert({
    where: { id: 'conv_2' }, update: {},
    create: { id: 'conv_2', guestId: 'guest_4', channel: 'email', subject: 'Re: Suite Availability April', status: 'open', lastMessageAt: new Date('2026-02-13T15:00:00Z') },
  });

  await prisma.message.upsert({
    where: { id: 'msg_3' }, update: {},
    create: { id: 'msg_3', conversationId: 'conv_2', direction: 'in', content: 'Hallo Ines, ich interessiere mich für die Villa Suite im April. Ist die Suite vom 1. bis 5. April verfügbar?', channel: 'email', sentAt: new Date('2026-02-13T14:00:00Z') },
  });
  await prisma.message.upsert({
    where: { id: 'msg_4' }, update: {},
    create: { id: 'msg_4', conversationId: 'conv_2', direction: 'out', content: 'Lieber Thomas, ja die Sunset Suite ist im April noch frei! Ich schicke Ihnen gerne ein Angebot. Der Preis beträgt €180 pro Nacht.', channel: 'email', sentAt: new Date('2026-02-13T15:00:00Z') },
  });

  console.log('  Conversations: 2 with 4 messages');

  console.log('\nSeed complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
