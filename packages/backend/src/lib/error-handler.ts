import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './errors.js';

const APP_ERROR_CODES = new Set([
  'NOT_FOUND',
  'CONFLICT',
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'UNPROCESSABLE_ENTITY',
  'SERVICE_UNAVAILABLE',
]);

function isAppErrorLike(error: unknown): error is {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
} {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as Record<string, unknown>;
  return (
    typeof candidate.statusCode === 'number'
    && candidate.statusCode >= 400
    && candidate.statusCode < 600
    && typeof candidate.code === 'string'
    && APP_ERROR_CODES.has(candidate.code)
    && typeof candidate.message === 'string'
  );
}

export function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError || isAppErrorLike(error)) {
    reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.flatten().fieldErrors,
      },
    });
    return;
  }

  // Fastify validation errors
  if (error.validation) {
    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
      },
    });
    return;
  }

  // Fastify content-type parser error for empty JSON body.
  // Example: POST with "Content-Type: application/json" and no payload.
  if (error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
    reply.status(400).send({
      error: {
        code: 'BAD_REQUEST',
        message: error.message,
      },
    });
    return;
  }

  // Unexpected errors
  reply.log.error(error);
  reply.status(500).send({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
