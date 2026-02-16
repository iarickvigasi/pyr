/**
 * Prisma `where` filter for non-soft-deleted records.
 * Spread into any query: `{ where: { id, ...notDeleted } }`
 */
export const notDeleted = { deletedAt: null } as const;

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
