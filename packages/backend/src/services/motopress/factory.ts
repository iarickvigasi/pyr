import type { Env } from '../../config/env.js';
import { BadRequestError } from '../../lib/errors.js';
import { MotopressClient } from './client.js';

export type MotopressEnv = Pick<
  Env,
  'MOTOPRESS_ENABLED' | 'MOTOPRESS_BASE_URL' | 'MOTOPRESS_CONSUMER_KEY' | 'MOTOPRESS_CONSUMER_SECRET' | 'MOTOPRESS_TIMEOUT_MS'
>;

export function createMotopressClientFromEnv(config: MotopressEnv): MotopressClient {
  if (!config.MOTOPRESS_ENABLED) {
    throw new BadRequestError('MotoPress sync is disabled. Enable MOTOPRESS_ENABLED in environment.');
  }
  if (!config.MOTOPRESS_BASE_URL) {
    throw new BadRequestError('MotoPress base URL is missing. Set MOTOPRESS_BASE_URL.');
  }
  if (!config.MOTOPRESS_CONSUMER_KEY || !config.MOTOPRESS_CONSUMER_SECRET) {
    throw new BadRequestError('MotoPress credentials are missing. Set MOTOPRESS_CONSUMER_KEY and MOTOPRESS_CONSUMER_SECRET.');
  }

  return new MotopressClient({
    baseUrl: config.MOTOPRESS_BASE_URL,
    consumerKey: config.MOTOPRESS_CONSUMER_KEY,
    consumerSecret: config.MOTOPRESS_CONSUMER_SECRET,
    timeoutMs: config.MOTOPRESS_TIMEOUT_MS,
  });
}
