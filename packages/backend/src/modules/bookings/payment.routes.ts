import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { idParamSchema } from '@pyr/shared';
import { createPaymentSchema, bookingPaymentParamSchema } from './payment.schema.js';
import { createPayment, deletePayment, listPayments } from './payment.service.js';

export default async function paymentRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.addHook('onRequest', app.authenticate);

  // GET /:id/payments -- List payments for a booking
  server.get('/:id/payments', {
    schema: {
      tags: ['Payments'],
      summary: 'List payments for a booking',
      params: idParamSchema,
    },
  }, async (request) => {
    const payments = await listPayments(app.prisma, request.params.id);
    return { data: payments };
  });

  // POST /:id/payments -- Log a new payment
  server.post('/:id/payments', {
    schema: {
      tags: ['Payments'],
      summary: 'Log a payment for a booking',
      params: idParamSchema,
      body: createPaymentSchema,
    },
  }, async (request, reply) => {
    const payment = await createPayment(
      app.prisma,
      request.params.id,
      request.body,
      request.user?.sub,
    );
    return reply.status(201).send({ data: payment });
  });

  // DELETE /:id/payments/:paymentId -- Soft-delete a payment
  server.delete('/:id/payments/:paymentId', {
    schema: {
      tags: ['Payments'],
      summary: 'Soft-delete an erroneous payment entry',
      params: bookingPaymentParamSchema,
    },
  }, async (request, reply) => {
    await deletePayment(
      app.prisma,
      request.params.id,
      request.params.paymentId,
      request.user?.sub,
    );
    return reply.status(204).send();
  });
}
