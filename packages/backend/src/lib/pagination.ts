/** Standard cursor-based pagination response envelope. */
export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Clamp a user-supplied limit to a safe range (1..100), defaulting to 20.
 *
 * @example
 * const limit = clampLimit(query.limit);
 * const items = await prisma.model.findMany({ take: limit + 1 });
 */
export function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(limit, MAX_PAGE_SIZE);
}
