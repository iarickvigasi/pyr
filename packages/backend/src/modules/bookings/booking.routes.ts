import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { idParamSchema, QUEUE_NAMES } from '@pyr/shared';
import type { CalendarSyncJobData } from '@pyr/shared';
import {
  createBookingSchema,
  updateBookingSchema,
  listBookingsQuerySchema,
} from './booking.schema.js';
import {
  listBookings,
  getBooking,
  createBooking,
  updateBooking,
  cancelBooking,
} from './booking.service.js';
import { sendNewBookingAlert } from '../notifications/notification.service.js';

/**
 * Enqueue a calendar sync job for a booking mutation.
 * Wrapped in try/catch so sync failures never block the primary operation.
 */
async function enqueueCalendarSync(
  app: FastifyInstance,
  entityId: string,
  action: CalendarSyncJobData['action'],
): Promise<void> {
  const calQueue = app.queues?.getQueue(QUEUE_NAMES.CALENDAR_SYNC);
  if (calQueue) {
    try {
      await calQueue.add('calendar-sync', {
        entityType: 'booking',
        entityId,
        action,
      } satisfies CalendarSyncJobData);
    } catch (err) {
      app.log.error({ err, bookingId: entityId }, 'Failed to enqueue calendar sync job for booking');
    }
  }
}

export default async function bookingRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.addHook('onRequest', app.authenticate);

  server.get('/', {
    schema: { tags: ['Bookings'], summary: 'List bookings with status, guest, and date filters', querystring: listBookingsQuerySchema },
  }, async (request) => {
    return listBookings(app.prisma, request.query);
  });

  server.get('/:id', {
    schema: { tags: ['Bookings'], summary: 'Get booking detail with guest and room info', params: idParamSchema },
  }, async (request) => {
    return { data: await getBooking(app.prisma, request.params.id) };
  });

  server.post('/', {
    schema: { tags: ['Bookings'], summary: 'Create a booking (checks availability)', body: createBookingSchema },
  }, async (request, reply) => {
    const booking = await createBooking(app.prisma, request.body, request.user?.sub);
    await enqueueCalendarSync(app, booking.id, 'create');
    // Fire-and-forget WhatsApp alert (never blocks the booking response)
    sendNewBookingAlert(app, booking.id).catch(err =>
      app.log.error({ err }, 'Failed to send new booking alert'),
    );
    return reply.status(201).send({ data: booking });
  });

  server.patch('/:id', {
    schema: { tags: ['Bookings'], summary: 'Update booking (enforces status transitions)', params: idParamSchema, body: updateBookingSchema },
  }, async (request) => {
    const booking = await updateBooking(app.prisma, request.params.id, request.body, request.user?.sub);
    await enqueueCalendarSync(app, booking.id, 'update');
    return { data: booking };
  });

  server.delete('/:id', {
    schema: { tags: ['Bookings'], summary: 'Cancel and soft-delete a booking', params: idParamSchema },
  }, async (request, reply) => {
    await cancelBooking(app.prisma, request.params.id, request.user?.sub);
    await enqueueCalendarSync(app, request.params.id, 'delete');
    return reply.status(204).send();
  });
}
