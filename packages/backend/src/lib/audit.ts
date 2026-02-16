import type { PrismaClient, Prisma, AuditAction } from '@prisma/client';

type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes?: Record<string, unknown> | null;
  actor: string;
}

/**
 * Write an entry to the audit_log table. Works with both PrismaClient and
 * transaction clients, so it can be called inside `prisma.$transaction()`.
 *
 * @example
 * await writeAuditLog(prisma, {
 *   entityType: 'guest', entityId: guest.id,
 *   action: 'create', changes: data, actor: 'admin:123',
 * });
 */
export async function writeAuditLog(
  client: PrismaClient | TransactionClient,
  entry: AuditEntry,
): Promise<void> {
  await (client as PrismaClient).auditLog.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      changes: entry.changes as Prisma.InputJsonValue ?? undefined,
      actor: entry.actor,
    },
  });
}
