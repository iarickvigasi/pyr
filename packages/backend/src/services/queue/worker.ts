// BullMQ worker entry point — implemented in E4.
// Registers processors for all queues defined in queue.ts. Each job type
// delegates to its dedicated job handler in services/queue/jobs/.
// Business rule: workers run in the same Node.js process as the API server
// for MVP simplicity — split to a separate process for production scale.
export {};
