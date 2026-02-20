import { DAVClient } from 'tsdav';
import type { DAVCalendar } from 'tsdav';
import type { PrismaClient } from '@prisma/client';
import { decrypt } from '../../lib/encryption.js';

// ─── Types ──────────────────────────────────────────────────

export interface CaldavConfig {
  serverUrl: string;
  username: string;
  password: string;
  calendarName: string;
}

const CALDAV_PROVIDER_CONFIG_KEY = 'caldav_provider';
const DEFAULT_CALENDAR_NAME = 'Puppy Yoga Retreat';
const DEFAULT_SERVER_URL = 'https://caldav.icloud.com';

// ─── Cached Client ──────────────────────────────────────────

let cachedClient: DAVClient | null = null;
let cachedCalendar: DAVCalendar | null = null;

// ─── Config Resolution ──────────────────────────────────────

/**
 * Load CalDAV credentials from Settings table (encrypted).
 * Falls back to environment variables if no settings found.
 * Same pattern as email provider config (03-02 decision).
 */
export async function getCaldavConfig(prisma: PrismaClient): Promise<CaldavConfig> {
  // Try settings table first
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: CALDAV_PROVIDER_CONFIG_KEY },
    });

    if (setting) {
      const config = setting.value as Record<string, unknown>;
      if (config && typeof config === 'object' && config.encryptedPassword) {
        const decryptedPassword = decrypt(config.encryptedPassword as string);
        return {
          serverUrl: (config.serverUrl as string) || DEFAULT_SERVER_URL,
          username: config.username as string,
          password: decryptedPassword,
          calendarName: (config.calendarName as string) || DEFAULT_CALENDAR_NAME,
        };
      }
    }
  } catch {
    // Settings-based config not available -- fall back to env vars
  }

  // Fall back to environment variables
  const serverUrl = process.env.CALDAV_URL || DEFAULT_SERVER_URL;
  const username = process.env.CALDAV_USER || '';
  const password = process.env.CALDAV_PASS || '';

  if (!username || !password) {
    throw new Error(
      'CalDAV credentials not configured. Set CALDAV_USER and CALDAV_PASS environment variables or configure via Settings.',
    );
  }

  return {
    serverUrl,
    username,
    password,
    calendarName: DEFAULT_CALENDAR_NAME,
  };
}

// ─── Client Factory ─────────────────────────────────────────

/**
 * Lazy singleton CalDAV client. Creates DAVClient, logs in, and
 * discovers the target calendar by displayName. Caches both client
 * and calendar for subsequent calls.
 *
 * Throws descriptive error if:
 * - Login fails (bad credentials or server unreachable)
 * - Target calendar not found by displayName
 */
export async function getCaldavClient(prisma: PrismaClient): Promise<{
  client: DAVClient;
  calendar: DAVCalendar;
}> {
  if (cachedClient && cachedCalendar) {
    return { client: cachedClient, calendar: cachedCalendar };
  }

  const config = await getCaldavConfig(prisma);

  const client = new DAVClient({
    serverUrl: config.serverUrl,
    credentials: {
      username: config.username,
      password: config.password,
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });

  try {
    await client.login();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to connect to CalDAV server at ${config.serverUrl}: ${message}`,
    );
  }

  let calendars: DAVCalendar[];
  try {
    calendars = await client.fetchCalendars();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch calendars from CalDAV server: ${message}`);
  }

  const calendar = calendars.find(
    (c) => c.displayName === config.calendarName,
  );

  if (!calendar) {
    const available = calendars
      .map((c) => c.displayName)
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `Calendar "${config.calendarName}" not found on CalDAV server. Available calendars: ${available || 'none'}`,
    );
  }

  cachedClient = client;
  cachedCalendar = calendar;
  return { client, calendar };
}

// ─── Cache Reset ────────────────────────────────────────────

/**
 * Clear cached client and calendar.
 * Call when CalDAV settings are updated to force reconnection
 * with new credentials on the next operation.
 */
export function resetCaldavClient(): void {
  cachedClient = null;
  cachedCalendar = null;
}
