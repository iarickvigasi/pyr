import fp from 'fastify-plugin';
import { Queue, Worker } from 'bullmq';
import type { ConnectionOptions, Processor, WorkerOptions, QueueOptions, Job } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import type { FastifyInstance } from 'fastify';
import { QUEUE_NAMES } from '@pyr/shared';
import type { DeadLetterJobData } from '@pyr/shared';
import { writeAuditLog } from '../lib/audit.js';

declare module 'fastify' {
  interface FastifyInstance {
    queues: QueueManager;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Queue generic is unresolvable across BullMQ's internal type extraction
type AnyQueue = Queue<any, any, string>;

export interface QueueManager {
  createQueue<T>(name: string, opts?: Partial<QueueOptions>): Queue<T>;
  createWorker<T>(name: string, processor: Processor<T>, opts?: Partial<WorkerOptions>): Worker<T>;
  getQueue(name: string): AnyQueue | undefined;
  getQueues(): AnyQueue[];
  addToBullBoard(queue: AnyQueue): void;
}

/** Parse REDIS_URL into host/port/password/db for worker connections */
function parseRedisUrl(redisUrl: string): {
  host: string;
  port: number;
  password?: string;
  db?: number;
} {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
  };
}

export default fp(async function queuePlugin(fastify: FastifyInstance) {
  const registeredQueues = new Map<string, AnyQueue>();
  const registeredWorkers: Array<{ worker: Worker; name: string }> = [];

  // Parse REDIS_URL for worker connections (they need their own blocking connections)
  const workerConnectionOpts = {
    ...parseRedisUrl(fastify.config.REDIS_URL),
    maxRetriesPerRequest: null as null,
    enableReadyCheck: true,
  };

  // Bull Board setup
  const serverAdapter = new FastifyAdapter();
  const basePath = '/api/v1/admin/queues';
  serverAdapter.setBasePath(basePath);

  const board = createBullBoard({
    queues: [],
    serverAdapter,
  });

  /** Move permanently failed job to dead letter queue and write audit log entry */
  async function moveToDLQ(
    queueName: string,
    job: Job,
    error: Error,
  ): Promise<void> {
    const dlq = registeredQueues.get(QUEUE_NAMES.DEAD_LETTER);
    if (!dlq) {
      fastify.log.error({ queue: queueName, jobId: job.id }, 'Dead letter queue not found');
      return;
    }

    await dlq.add('dead-letter', {
      originalQueue: queueName,
      originalJobId: job.id ?? 'unknown',
      originalData: job.data,
      failedReason: error.message,
      failedAt: new Date().toISOString(),
      attemptsMade: job.attemptsMade,
    } satisfies DeadLetterJobData);

    // Audit log for visibility -- Ines sees permanent failures in the audit trail
    // and the dashboard can surface audit entries of type 'queue_failure'
    await writeAuditLog(fastify.prisma, {
      entityType: 'queue_failure',
      entityId: job.id ?? 'unknown',
      action: 'create',
      changes: {
        queue: queueName,
        failedReason: error.message,
        attemptsMade: job.attemptsMade,
        originalData: job.data,
      },
      actor: 'system',
    });

    fastify.log.error(
      { queue: queueName, jobId: job.id, error: error.message, attemptsMade: job.attemptsMade },
      'Job permanently failed -- moved to DLQ and audit-logged',
    );
  }

  const manager: QueueManager = {
    createQueue<T>(name: string, opts?: Partial<QueueOptions>): Queue<T> {
      const queue = new Queue<T>(name, {
        // Cast needed: ioredis version in app (5.9.3) differs from BullMQ's peer (5.9.2)
        connection: fastify.redis as unknown as ConnectionOptions,
        defaultJobOptions: {
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 500 },
        },
        ...opts,
      });

      registeredQueues.set(name, queue as AnyQueue);

      // Automatically add to Bull Board
      board.addQueue(new BullMQAdapter(queue));

      fastify.log.info({ queue: name }, 'Queue created');
      return queue;
    },

    createWorker<T>(name: string, processor: Processor<T>, opts?: Partial<WorkerOptions>): Worker<T> {
      const worker = new Worker<T>(name, processor, {
        connection: workerConnectionOpts,
        autorun: false,
        ...opts,
      });

      // REQUIRED: error handler prevents process crash from unhandled EventEmitter error
      worker.on('error', (err) => {
        fastify.log.error({ err, queue: name }, 'Worker error (non-fatal)');
      });

      // Check if all retries exhausted and move to DLQ
      worker.on('failed', (job, err) => {
        if (job && job.attemptsMade >= (job.opts?.attempts ?? 1)) {
          moveToDLQ(name, job, err).catch((dlqErr) => {
            fastify.log.error({ err: dlqErr, queue: name, jobId: job.id }, 'Failed to move job to DLQ');
          });
        }
      });

      registeredWorkers.push({ worker: worker as unknown as Worker, name });

      // Start worker
      void worker.run();

      fastify.log.info({ worker: name }, 'Worker started');
      return worker;
    },

    getQueue(name: string): AnyQueue | undefined {
      return registeredQueues.get(name);
    },

    getQueues(): AnyQueue[] {
      return [...registeredQueues.values()];
    },

    addToBullBoard(queue: AnyQueue): void {
      board.addQueue(new BullMQAdapter(queue));
    },
  };

  fastify.decorate('queues', manager);

  // Register Bull Board behind auth
  await fastify.register(async (scope) => {
    scope.addHook('onRequest', fastify.authenticate);
    await scope.register(serverAdapter.registerPlugin(), { prefix: basePath });
  });

  fastify.log.info({ path: basePath }, 'Bull Board mounted');

  // Graceful shutdown: close workers first (with timeout), then queues
  const SHUTDOWN_TIMEOUT = 15_000;

  const closeWithTimeout = (worker: Worker, name: string): Promise<void> =>
    Promise.race([
      worker.close().then(() => fastify.log.info({ worker: name }, 'Worker shut down')),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          fastify.log.warn({ worker: name }, 'Worker shutdown timed out');
          resolve();
        }, SHUTDOWN_TIMEOUT),
      ),
    ]);

  fastify.addHook('onClose', async () => {
    fastify.log.info('Shutting down queue workers...');

    // Close all workers with timeout
    await Promise.all(
      registeredWorkers.map(({ worker, name }) => closeWithTimeout(worker, name)),
    );

    // Close all queues
    await Promise.all(
      [...registeredQueues.values()].map((q) => q.close()),
    );

    fastify.log.info('All queues and workers shut down');
  });
});
