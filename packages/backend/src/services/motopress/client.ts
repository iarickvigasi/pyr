import { z } from 'zod';
import {
  motopressAccommodationCollectionSchema,
  motopressAccommodationTypeCollectionSchema,
  motopressBookingCollectionSchema,
  motopressBookingUpsertPayloadSchema,
  motopressBookingSchema,
  type MotopressAccommodation,
  type MotopressAccommodationType,
  type MotopressBooking,
  type MotopressBookingUpsertPayload,
} from './schemas.js';

const listCollectionQuerySchema = z.object({
  page: z.number().int().positive().optional(),
  per_page: z.number().int().positive().max(100).optional(),
  after: z.string().datetime().optional(),
  before: z.string().datetime().optional(),
  context: z.enum(['view', 'edit']).optional(),
  _embed: z.boolean().optional(),
});

export interface MotopressClientOptions {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class MotopressHttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`MotoPress API request failed with status ${status}`);
    this.name = 'MotopressHttpError';
    this.status = status;
    this.body = body;
  }
}

export class MotopressValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MotopressValidationError';
  }
}

export class MotopressClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly authHeader: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: MotopressClientOptions) {
    if (!opts.baseUrl) {
      throw new Error('MotoPress base URL is required');
    }
    if (!opts.consumerKey || !opts.consumerSecret) {
      throw new Error('MotoPress API credentials are required');
    }

    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;

    const token = Buffer.from(`${opts.consumerKey}:${opts.consumerSecret}`).toString('base64');
    this.authHeader = `Basic ${token}`;
  }

  async listBookings(params: z.input<typeof listCollectionQuerySchema> = {}): Promise<MotopressBooking[]> {
    const query = listCollectionQuerySchema.parse(params);
    return this.request({
      path: '/bookings',
      schema: motopressBookingCollectionSchema,
      query,
    });
  }

  async listAccommodations(params: z.input<typeof listCollectionQuerySchema> = {}): Promise<MotopressAccommodation[]> {
    const query = listCollectionQuerySchema.parse(params);
    return this.request({
      path: '/accommodations',
      schema: motopressAccommodationCollectionSchema,
      query,
    });
  }

  async listAccommodationTypes(params: z.input<typeof listCollectionQuerySchema> = {}): Promise<MotopressAccommodationType[]> {
    const query = listCollectionQuerySchema.parse(params);
    return this.request({
      path: '/accommodation_types',
      schema: motopressAccommodationTypeCollectionSchema,
      query,
    });
  }

  async getBooking(id: number): Promise<MotopressBooking> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Booking id must be a positive integer');
    }

    return this.request({
      path: `/bookings/${id}`,
      schema: motopressBookingSchema,
    });
  }

  async createBooking(payload: z.input<typeof motopressBookingUpsertPayloadSchema>): Promise<MotopressBooking> {
    const body = motopressBookingUpsertPayloadSchema.parse(payload) satisfies MotopressBookingUpsertPayload;
    return this.request({
      method: 'POST',
      path: '/bookings',
      schema: motopressBookingSchema,
      body,
    });
  }

  async updateBooking(id: number, payload: z.input<typeof motopressBookingUpsertPayloadSchema>): Promise<MotopressBooking> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Booking id must be a positive integer');
    }
    const body = motopressBookingUpsertPayloadSchema.parse(payload) satisfies MotopressBookingUpsertPayload;
    return this.request({
      method: 'PATCH',
      path: `/bookings/${id}`,
      schema: motopressBookingSchema,
      body,
    });
  }

  async healthCheck(): Promise<{ ok: true }> {
    await this.listBookings({ per_page: 1, page: 1, context: 'view' });
    return { ok: true };
  }

  private async request<T>(opts: {
    path: string;
    schema: z.ZodType<T>;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
  }): Promise<T> {
    const url = new URL(`${this.baseUrl}${opts.path}`);

    if (opts.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: opts.method ?? 'GET',
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
        signal: controller.signal,
      });

      const rawBody = await response.text();
      const parsedBody = rawBody ? safeParseJson(rawBody) : null;

      if (!response.ok) {
        throw new MotopressHttpError(response.status, parsedBody ?? rawBody);
      }

      const result = opts.schema.safeParse(parsedBody);
      if (!result.success) {
        throw new MotopressValidationError(`MotoPress response validation failed: ${result.error.message}`);
      }

      return result.data;
    } catch (error) {
      if (isAbortError(error)) {
        throw new Error(`MotoPress request timeout after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.message.includes('aborted');
}
