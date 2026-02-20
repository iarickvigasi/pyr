/**
 * Calendar module service -- manages CalDAV config, sync status, and re-sync.
 *
 * - getSyncStatus: Aggregates CalendarEvent counts by syncStatus
 * - resyncAll: Resets all CalendarEvent records to pending, enqueues sync jobs
 * - saveCaldavConfig: Persists encrypted CalDAV credentials to Settings table
 * - getCaldavConfigForUi: Returns CalDAV config with password masked
 * - testCaldavConnection: Verifies CalDAV credentials work
 */

import type { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { QUEUE_NAMES } from '@pyr/shared';
import type { CalendarSyncJobData } from '@pyr/shared';
import { encrypt, decrypt } from '../../lib/encryption.js';
import { writeAuditLog } from '../../lib/audit.js';
import { getCaldavClient, resetCaldavClient } from '../../services/caldav/caldav.client.js';

// Settings key for CalDAV provider config (same pattern as email_provider_config)
const CALDAV_PROVIDER_CONFIG_KEY = 'caldav_provider';

// ─── Types ──────────────────────────────────────────────────

export interface SyncStatusResult {
  synced: number;
  pending: number;
  failed: number;
  lastSyncAt: string | null;
}

export interface ResyncResult {
  jobsEnqueued: number;
}

export interface CaldavUiConfig {
  configured: boolean;
  serverUrl: string | null;
  username: string | null;
  calendarName: string | null;
  password: string; // always empty for UI
}

export interface TestConnectionResult {
  success: boolean;
  calendarName?: string;
  error?: string;
}

// ─── Sync Status ────────────────────────────────────────────

/**
 * Get aggregated CalendarEvent sync status counts and last sync time.
 */
export async function getSyncStatus(prisma: PrismaClient): Promise<SyncStatusResult> {
  const [counts, lastSync] = await Promise.all([
    prisma.calendarEvent.groupBy({
      by: ['syncStatus'],
      _count: { _all: true },
    }),
    prisma.calendarEvent.findFirst({
      where: { lastSynced: { not: null } },
      orderBy: { lastSynced: 'desc' },
      select: { lastSynced: true },
    }),
  ]);

  let synced = 0;
  let pending = 0;
  let failed = 0;

  for (const row of counts) {
    const count = row._count._all;
    switch (row.syncStatus) {
      case 'synced':
        synced = count;
        break;
      case 'pending':
        pending = count;
        break;
      case 'failed':
        failed = count;
        break;
    }
  }

  return {
    synced,
    pending,
    failed,
    lastSyncAt: lastSync?.lastSynced?.toISOString() ?? null,
  };
}

// ─── Re-sync All ────────────────────────────────────────────

interface QueueManager {
  getQueue: (name: string) => { add: (jobName: string, data: CalendarSyncJobData) => Promise<unknown> } | undefined;
}

/**
 * Re-sync all bookings and events to the calendar.
 *
 * For each booking: upsert CalendarEvent record, reset syncStatus to pending,
 * enqueue calendar-sync job.
 * For each event: same pattern.
 *
 * Includes all bookings (even cancelled -- they get [CANCELLED] prefix in calendar).
 */
export async function resyncAll(
  prisma: PrismaClient,
  queues: QueueManager,
): Promise<ResyncResult> {
  // Load all bookings (including soft-deleted/cancelled for [CANCELLED] prefix)
  const bookings = await prisma.booking.findMany({
    select: { id: true },
  });

  // Load all events
  const events = await prisma.event.findMany({
    select: { id: true },
  });

  const queue = queues.getQueue(QUEUE_NAMES.CALENDAR_SYNC);
  if (!queue) {
    throw new Error('Calendar sync queue not available');
  }

  let jobsEnqueued = 0;

  // Process bookings
  for (const booking of bookings) {
    // Upsert CalendarEvent record
    const existing = await prisma.calendarEvent.findFirst({
      where: { bookingId: booking.id },
    });

    if (existing) {
      await prisma.calendarEvent.update({
        where: { id: existing.id },
        data: { syncStatus: 'pending', lastError: null },
      });
    } else {
      await prisma.calendarEvent.create({
        data: { bookingId: booking.id, syncStatus: 'pending', sequence: 0 },
      });
    }

    const action = existing?.caldavUid ? 'update' : 'create';
    await queue.add(`resync-booking-${booking.id}`, {
      entityType: 'booking',
      entityId: booking.id,
      action,
    });
    jobsEnqueued++;
  }

  // Process events
  for (const event of events) {
    const existing = await prisma.calendarEvent.findFirst({
      where: { eventId: event.id },
    });

    if (existing) {
      await prisma.calendarEvent.update({
        where: { id: existing.id },
        data: { syncStatus: 'pending', lastError: null },
      });
    } else {
      await prisma.calendarEvent.create({
        data: { eventId: event.id, syncStatus: 'pending', sequence: 0 },
      });
    }

    const action = existing?.caldavUid ? 'update' : 'create';
    await queue.add(`resync-event-${event.id}`, {
      entityType: 'event',
      entityId: event.id,
      action,
    });
    jobsEnqueued++;
  }

  return { jobsEnqueued };
}

// ─── CalDAV Config Management ──────────────────────────────

/**
 * Save CalDAV provider config to Settings table (encrypted password).
 * Resets the cached CalDAV client so next operation uses new credentials.
 */
export async function saveCaldavConfig(
  prisma: PrismaClient,
  config: { serverUrl: string; username: string; password: string; calendarName: string },
  actor: string,
): Promise<void> {
  const encryptedPassword = encrypt(config.password);

  const storedValue = {
    serverUrl: config.serverUrl,
    username: config.username,
    encryptedPassword,
    calendarName: config.calendarName,
  };

  await prisma.$transaction(async (tx) => {
    const existing = await tx.setting.findUnique({
      where: { key: CALDAV_PROVIDER_CONFIG_KEY },
    });
    const action = existing ? 'update' : 'create';

    await tx.setting.upsert({
      where: { key: CALDAV_PROVIDER_CONFIG_KEY },
      create: {
        key: CALDAV_PROVIDER_CONFIG_KEY,
        value: storedValue as unknown as Prisma.InputJsonValue,
      },
      update: {
        value: storedValue as unknown as Prisma.InputJsonValue,
      },
    });

    await writeAuditLog(tx, {
      entityType: 'setting',
      entityId: CALDAV_PROVIDER_CONFIG_KEY,
      action,
      changes: {
        serverUrl: config.serverUrl,
        username: config.username,
        calendarName: config.calendarName,
        password: '***REDACTED***',
      },
      actor,
    });
  });

  // Invalidate cached CalDAV client so next operation uses new credentials
  resetCaldavClient();
}

/**
 * Load CalDAV config for UI display. Password is always empty (masked).
 */
export async function getCaldavConfigForUi(prisma: PrismaClient): Promise<CaldavUiConfig> {
  const setting = await prisma.setting.findUnique({
    where: { key: CALDAV_PROVIDER_CONFIG_KEY },
  });

  if (!setting) {
    return {
      configured: false,
      serverUrl: null,
      username: null,
      calendarName: null,
      password: '',
    };
  }

  const config = setting.value as Record<string, unknown>;
  if (!config || typeof config !== 'object' || !config.encryptedPassword) {
    return {
      configured: false,
      serverUrl: null,
      username: null,
      calendarName: null,
      password: '',
    };
  }

  return {
    configured: true,
    serverUrl: (config.serverUrl as string) ?? null,
    username: (config.username as string) ?? null,
    calendarName: (config.calendarName as string) ?? null,
    password: '', // Never return password
  };
}

/**
 * Test CalDAV connection with current config (from Settings or env vars).
 * Returns success status and discovered calendar name.
 */
export async function testCaldavConnection(prisma: PrismaClient): Promise<TestConnectionResult> {
  try {
    const { calendar } = await getCaldavClient(prisma);
    // Reset the cached client after test so that if credentials change before
    // actual sync, the old connection is not reused
    resetCaldavClient();
    return {
      success: true,
      calendarName: typeof calendar.displayName === 'string' ? calendar.displayName : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
    };
  }
}
