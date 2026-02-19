/**
 * Typed HTTP error classes for the PYR backend.
 *
 * The error handler in `error-handler.ts` maps these to JSON:
 *   { error: { code: string, message: string, details?: unknown } }
 *
 * ## Which error to throw
 *
 * | Error class           | Status | When to use |
 * |-----------------------|--------|-------------|
 * | `BadRequestError`     | 400    | Invalid request that the client should fix. Examples: check-out before check-in, merging a guest with itself, required field missing. |
 * | `UnauthorizedError`   | 401    | Missing or invalid authentication credentials. |
 * | `NotFoundError`       | 404    | Requested resource does not exist (or was soft-deleted). |
 * | `ConflictError`       | 409    | Uniqueness or overlap constraint violated. Examples: duplicate room name (P2002), overlapping season dates, double-booking a room. |
 * | `UnprocessableError`  | 422    | Valid request, but blocked by current application state. Examples: invalid booking status transition (confirmed → inquiry), approving an already-rejected draft. |
 *
 * Never throw a raw `Error` from service functions — always use one of these
 * typed subclasses so the error handler can map it to the correct HTTP status.
 *
 * Zod validation failures are handled automatically by the Fastify Zod provider
 * and return 400 without needing a manual throw.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** 404 — Requested resource does not exist or was soft-deleted. */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(404, id ? `${resource} with id '${id}' not found` : `${resource} not found`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/** 409 — Uniqueness or overlap constraint violated (e.g. duplicate name, double-booking). */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

/** 400 — Invalid request that the client should fix (bad dates, self-merge, etc.). */
export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, message, 'BAD_REQUEST', details);
    this.name = 'BadRequestError';
  }
}

/** 401 — Missing or invalid authentication credentials. */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * 422 — Valid request blocked by current application state.
 *
 * Use when the request is syntactically correct but cannot be processed given
 * the current state of the system. Examples:
 * - Booking status transition that is not allowed by the state machine
 *   (e.g. `confirmed → inquiry` is not a valid transition)
 * - Approving a draft that has already been rejected
 *
 * Prefer `BadRequestError` (400) for input validation failures (bad dates, etc.)
 * and `ConflictError` (409) for uniqueness/overlap violations.
 */
export class UnprocessableError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, message, 'UNPROCESSABLE_ENTITY', details);
    this.name = 'UnprocessableError';
  }
}
