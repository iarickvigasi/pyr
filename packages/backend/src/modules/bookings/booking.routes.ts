import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { idParamSchema } from '@pyr/shared';
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
import { syncBookingToMotopress } from './booking-sync.service.js';
import { sendNewBookingAlert } from '../notifications/notification.service.js';
import { enqueueCalendarSyncJob } from '../../services/caldav/calendar-sync-queue.js';

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
    await enqueueCalendarSyncJob({
      app,
      entityType: 'booking',
      entityId: booking.id,
      action: 'create',
      errorLogMessage: 'Failed to enqueue calendar sync job for booking',
    });
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
    await enqueueCalendarSyncJob({
      app,
      entityType: 'booking',
      entityId: booking.id,
      action: booking.status === 'cancelled' ? 'delete' : 'update',
      errorLogMessage: 'Failed to enqueue calendar sync job for booking',
    });
    return { data: booking };
  });

  server.delete('/:id', {
    schema: { tags: ['Bookings'], summary: 'Cancel and soft-delete a booking', params: idParamSchema },
  }, async (request, reply) => {
    await cancelBooking(app.prisma, request.params.id, request.user?.sub);
    await enqueueCalendarSyncJob({
      app,
      entityType: 'booking',
      entityId: request.params.id,
      action: 'delete',
      errorLogMessage: 'Failed to enqueue calendar sync job for booking',
    });
    return reply.status(204).send();
  });

  server.post('/:id/sync/motopress', {
    schema: { tags: ['Bookings'], summary: 'Manually sync booking to MotoPress', params: idParamSchema },
  }, async (request) => {
    const result = await syncBookingToMotopress(
      app.prisma,
      request.params.id,
      app.config,
      request.user?.sub,
    );
    app.log.info(
      {
        bookingId: request.params.id,
        provider: result.provider,
        externalBookingId: result.externalBookingId,
      },
      'Manual booking sync to MotoPress completed',
    );
    return { data: result };
  });
}
