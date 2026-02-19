import type { Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import type { HealthCheckJobData } from '@pyr/shared';

/**
 * Health check job processor -- verifies queue infrastructure, DB, and Redis are working.
 * This is the only job with a real implementation in Phase 1.
 */
export function createHealthCheckProcessor(app: FastifyInstance) {
  return async (job: Job<HealthCheckJobData>): Promise<void> => {
    app.log.info({ jobId: job.id, timestamp: job.data.timestamp }, 'Health check running');

    // Verify database connectivity
    await app.prisma.$queryRaw`SELECT 1`;

    // Verify Redis connectivity
    await app.redis.ping();

    app.log.info({ jobId: job.id }, 'Health check passed');
  };
}
