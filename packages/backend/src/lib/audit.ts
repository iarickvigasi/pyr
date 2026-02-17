import type { Prisma, AuditAction } from '@prisma/client';
import type { PrismaClientOrTx } from '../types/prisma.js';

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes?: Record<string, unknown> | null;
  actor: string;
}

/** Derive the actor string for audit logs from the authenticated user ID. */
export function getActor(userId?: string): string {
  if (!userId) return 'system';
  if (userId === 'api-key') return 'api-key';
  return `admin:${userId}`;
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
  client: PrismaClientOrTx,
  entry: AuditEntry,
): Promise<void> {
  await client.auditLog.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      changes: entry.changes as Prisma.InputJsonValue ?? undefined,
      actor: entry.actor,
    },
  });
}
