import { ConflictError } from './errors.js';

/**
 * Prisma `where` filter for non-soft-deleted records.
 * Spread into any query: `{ where: { id, ...notDeleted } }`
 */
export const notDeleted = { deletedAt: null } as const;

/**
 * Rethrows as ConflictError when Prisma throws P2002 (unique constraint violation).
 * Use in `.catch()` on create/update calls where unique names or identifiers are enforced.
 *
 * @example
 * const record = await tx.roomType.create({ data }).catch((err) => {
 *   handleUniqueConstraint(err, 'RoomType');
 * });
 */
export function handleUniqueConstraint(err: unknown, entity: string): never {
  if (
    err instanceof Error &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  ) {
    throw new ConflictError(`${entity} with that name already exists`);
  }
  throw err;
}

/**
 * Compute a diff of changed fields between two objects for audit logging.
 * Returns `null` if no fields changed, otherwise `{ field: { from, to } }`.
 *
 * @example
 * const changes = computeChanges(existingGuest, updatedGuest);
 * if (changes) await writeAuditLog(prisma, { ...entry, changes });
 */
export function computeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const key of Object.keys(after)) {
    const oldVal = before[key];
    const newVal = after[key];

    if (oldVal instanceof Date && newVal instanceof Date) {
      if (oldVal.getTime() !== newVal.getTime()) {
        changes[key] = { from: oldVal.toISOString(), to: newVal.toISOString() };
      }
    } else if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes[key] = { from: oldVal, to: newVal };
      }
    } else if (oldVal !== newVal) {
      changes[key] = { from: oldVal, to: newVal };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}
