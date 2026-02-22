/**
 * In-memory pending action state management for two-step confirmation flow.
 *
 * All write actions go through: prepare (validate + store) -> confirm (execute).
 * This module stores pending actions in a Map with TTL-based cleanup.
 *
 * In-memory Map is sufficient for single-user, single-Gateway-instance operation.
 * If the Gateway restarts, pending actions are lost -- Ines can re-request.
 */

export interface PendingAction {
  id: string;
  type: 'create_booking' | 'create_event' | 'send_reminder' | 'approve_draft';
  summary: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

const pendingActions = new Map<string, PendingAction>();

/** Default TTL: 1 hour (3,600,000 ms). */
const DEFAULT_MAX_AGE_MS = 3_600_000;

/**
 * Store a pending action for later confirmation.
 */
export function storePendingAction(action: PendingAction): void {
  pendingActions.set(action.id, action);
}

/**
 * Retrieve a pending action by ID.
 */
export function getPendingAction(id: string): PendingAction | undefined {
  return pendingActions.get(id);
}

/**
 * Remove a pending action. Returns true if it existed.
 */
export function removePendingAction(id: string): boolean {
  return pendingActions.delete(id);
}

/**
 * Remove actions older than maxAgeMs (default 1 hour).
 * Called opportunistically from confirm_action and cancel_action tools.
 * Returns the number of stale actions removed.
 */
export function cleanupStaleActions(maxAgeMs: number = DEFAULT_MAX_AGE_MS): number {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;

  for (const [id, action] of pendingActions) {
    if (action.createdAt < cutoff) {
      pendingActions.delete(id);
      removed++;
    }
  }

  return removed;
}
