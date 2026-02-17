import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Transaction client type used in service functions
 * This is the type of the `tx` parameter in Prisma transactions
 */
export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Helper type for functions that accept either PrismaClient or TransactionClient
 */
export type PrismaClientOrTx = PrismaClient | TransactionClient;

/**
 * Type guard to check if a client is a transaction client
 */
export function isTransactionClient(client: PrismaClientOrTx): client is TransactionClient {
  return !('$transaction' in client);
}

/**
 * Common Prisma types re-exported for convenience
 */
export type { Prisma };
