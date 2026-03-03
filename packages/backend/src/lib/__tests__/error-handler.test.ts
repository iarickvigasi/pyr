import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../error-handler.js';
import { BadRequestError } from '../errors.js';

describe('errorHandler', () => {
  it('maps AppError instances to typed HTTP responses', async () => {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.get('/boom', async () => {
      throw new BadRequestError('Bad input');
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: 'Bad input',
      },
    });

    await app.close();
  });

  it('maps AppError-like objects (cross-module identity safe)', async () => {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.get('/boom-like', async () => {
      throw {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'Bad input from reloaded module',
      };
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/boom-like' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: 'Bad input from reloaded module',
      },
    });

    await app.close();
  });

  it('maps Fastify empty JSON body parser errors to 400 BAD_REQUEST', async () => {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.post('/empty-json', async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/empty-json',
      headers: {
        'content-type': 'application/json',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: "Body cannot be empty when content-type is set to 'application/json'",
      },
    });

    await app.close();
  });
});
