// Invoice routes — implemented in Phase 2 (PayPal integration).
// Will expose endpoints for creating PayPal invoices, checking payment status,
// and recording received payments. Financial amounts are stored as integer cents.
// Business rule: invoices are linked to bookings; one booking can have one invoice.
import type { FastifyInstance } from 'fastify';

export default async function invoiceRoutes(_app: FastifyInstance): Promise<void> {
  // Invoice endpoints — implemented in Phase 2
}
