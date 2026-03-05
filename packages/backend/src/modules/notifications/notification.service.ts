/**
 * Notification service -- gateway delivery, morning briefing builder, and alert formatters.
 *
 * All notifications are delivered via the persistent WebSocket connection to OpenClaw Gateway.
 * Delivery is best-effort: failures are logged but never throw,
 * so primary operations (booking creation, draft generation, etc.) are never blocked.
 */

import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import type { AlertType, BriefingData } from './notification.types.js';
import { utcMidnight, nicosiaToday } from '../../lib/date-helpers.js';
import { getSetting } from '../settings/settings.service.js';
import { isConversationClassification, isOtaClassification } from '../../services/email/inbox-classification.js';

type InboxNotificationClassification = 'conversation' | 'ota' | 'other';

interface TelegramNotificationConfig {
  enabled: boolean;
  ownerUserId: string | null;
  inboxScope: ReadonlySet<'conversation' | 'ota'>;
}

interface CachedTelegramNotificationConfig {
  expiresAt: number;
  value: TelegramNotificationConfig;
}

interface InboxEmailNotificationDetails {
  conversationId: string;
  classification: InboxNotificationClassification;
  subject: string;
  sender: string;
  receivedAt: string;
  snippet: string;
  inboxUrl: string;
}

const DEFAULT_INBOX_NOTIFY_SCOPE = 'conversation,ota';
const TELEGRAM_CFG_CACHE_TTL_MS = 30_000;
let telegramCfgCache: CachedTelegramNotificationConfig | null = null;

function parseBooleanSetting(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function parseInboxScope(raw: unknown): ReadonlySet<'conversation' | 'ota'> {
  const values: string[] = Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === 'string')
    : typeof raw === 'string'
      ? raw.split(',')
      : [];

  const normalized = values
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .flatMap((value) => {
      if (value === 'conversation' || value === 'conv') return ['conversation'] as const;
      if (value === 'ota') return ['ota'] as const;
      return [];
    });

  if (normalized.length === 0) {
    return new Set<'conversation' | 'ota'>(['conversation', 'ota']);
  }

  return new Set<'conversation' | 'ota'>(normalized);
}

async function readOptionalSettingValue(
  app: FastifyInstance,
  key: string,
): Promise<unknown | undefined> {
  if (!app.prisma) return undefined;
  try {
    const setting = await getSetting(app.prisma, key);
    return setting.value;
  } catch {
    return undefined;
  }
}

export async function resolveTelegramNotificationConfig(
  app: FastifyInstance,
  opts?: { forceRefresh?: boolean },
): Promise<TelegramNotificationConfig> {
  const forceRefresh = opts?.forceRefresh ?? false;
  const now = Date.now();
  if (!forceRefresh && telegramCfgCache && telegramCfgCache.expiresAt > now) {
    return telegramCfgCache.value;
  }

  const envEnabled = parseBooleanSetting(process.env.NOTIFY_TELEGRAM_ENABLED, true);
  const envOwnerUserId = (
    process.env.NOTIFY_TELEGRAM_OWNER_USER_ID
    ?? process.env.TELEGRAM_ALLOWED_USER_ID
    ?? ''
  ).trim() || null;
  const envScope = parseInboxScope(process.env.NOTIFY_INBOX_SCOPE ?? DEFAULT_INBOX_NOTIFY_SCOPE);

  const [enabledSetting, ownerSetting, scopeSetting] = await Promise.all([
    readOptionalSettingValue(app, 'notify_telegram_enabled'),
    readOptionalSettingValue(app, 'notify_telegram_owner_user_id'),
    readOptionalSettingValue(app, 'notify_inbox_scope'),
  ]);

  const enabled = parseBooleanSetting(enabledSetting, envEnabled);
  const ownerUserId = typeof ownerSetting === 'string' && ownerSetting.trim()
    ? ownerSetting.trim()
    : envOwnerUserId;
  const inboxScope = scopeSetting !== undefined
    ? parseInboxScope(scopeSetting)
    : envScope;

  const value: TelegramNotificationConfig = {
    enabled,
    ownerUserId,
    inboxScope,
  };

  telegramCfgCache = {
    value,
    expiresAt: now + TELEGRAM_CFG_CACHE_TTL_MS,
  };

  return value;
}

export async function validateTelegramNotificationConfig(
  app: FastifyInstance,
): Promise<void> {
  const config = await resolveTelegramNotificationConfig(app, { forceRefresh: true });

  if (!config.enabled) {
    app.log.info('Telegram notifications are disabled (NOTIFY_TELEGRAM_ENABLED=false)');
    return;
  }

  if (!config.ownerUserId) {
    app.log.warn(
      'Telegram notifications enabled but owner user id is missing; delivery will be skipped',
    );
    return;
  }

  app.log.info(
    {
      ownerUserId: config.ownerUserId,
      inboxScope: Array.from(config.inboxScope),
    },
    'Telegram notification delivery is configured',
  );
}

export async function shouldNotifyInboxTelegramForClassification(
  app: FastifyInstance,
  classification: string | null | undefined,
): Promise<boolean> {
  const config = await resolveTelegramNotificationConfig(app);
  if (!config.enabled || !config.ownerUserId) return false;

  if (isConversationClassification(classification)) {
    return config.inboxScope.has('conversation');
  }

  if (isOtaClassification(classification)) {
    return config.inboxScope.has('ota');
  }

  return false;
}

// ---------------------------------------------------------------------------
// Gateway Delivery
// ---------------------------------------------------------------------------

/**
 * Send a message to the OpenClaw Gateway via WebSocket agent RPC.
 * Session key behavior:
 * - deliver=true  -> sessionKey=agent:main:telegram:direct:<ownerUserId>
 * - deliver=false -> sessionKey=hook:draft:<timestamp>
 *
 * Best-effort: logs errors but never throws.
 */
export async function sendViaGateway(
  app: FastifyInstance,
  hookPath: string,
  message: string,
): Promise<void> {
  try {
    const deliver = hookPath !== 'draft';
    let sessionKey = hookPath === 'draft'
      ? `hook:draft:${Date.now()}`
      : `hook:${hookPath}`;

    const params: Record<string, unknown> = {
      message,
      agentId: 'main',
      sessionKey,
      deliver,
      idempotencyKey: crypto.randomUUID(),
    };

    if (deliver) {
      const telegramCfg = await resolveTelegramNotificationConfig(app);
      if (!telegramCfg.enabled) {
        app.log.info({ hookPath }, 'Skipping notification: Telegram notifications are disabled');
        return;
      }
      if (!telegramCfg.ownerUserId) {
        app.log.warn(
          { hookPath },
          'Skipping notification: owner Telegram user id is not configured',
        );
        return;
      }

      // Explicit routing avoids ambiguous/implicit channel delivery in OpenClaw.
      sessionKey = `agent:main:telegram:direct:${telegramCfg.ownerUserId}`;
      params['sessionKey'] = sessionKey;
      params['replyChannel'] = 'telegram';
      params['replyTo'] = telegramCfg.ownerUserId;
    }

    await app.gateway.request('agent', {
      ...params,
    });
    app.log.info({ hookPath, deliver }, 'Gateway agent request sent');
  } catch (err) {
    app.log.error({ err, hookPath }, 'Gateway agent request failed');
  }
}

// ---------------------------------------------------------------------------
// Briefing Formatter
// ---------------------------------------------------------------------------

/**
 * Format a briefing message for chat delivery.
 * Returns a friendly "nothing scheduled" message on empty days.
 */
export function formatBriefing(data: BriefingData): string {
  if (data.isEmpty) {
    return "Good morning, Ines! Nothing scheduled today -- enjoy the quiet. \u{1F43E}";
  }

  const lines: string[] = [];
  lines.push("Good morning, Ines! Here's your daily update:");
  lines.push('');
  lines.push(`Check-ins today: ${data.checkInsCount}`);
  lines.push(`Check-outs today: ${data.checkOutsCount}`);

  if (data.events.length > 0) {
    lines.push('');
    lines.push('Events today:');
    for (const e of data.events) {
      lines.push(`  ${e.time} -- ${e.title} (${e.registered}/${e.capacity})`);
    }
  } else {
    lines.push('');
    lines.push('No events scheduled today.');
  }

  lines.push('');
  lines.push(`Pending inquiries: ${data.pendingInquiries}`);
  lines.push(`Yesterday's revenue: EUR ${formatEurCents(data.yesterdayRevenue)}`);

  return lines.join('\n');
}

/**
 * Format integer cents as a EUR string (e.g., 12050 -> "120.50").
 */
function formatEurCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// Guest Name Formatting
// ---------------------------------------------------------------------------

/**
 * Format guest names from bookingGuests junction for display in alerts.
 * - 1 guest: "Anna Schmidt"
 * - 2 guests: "Anna Schmidt & Max Muller"
 * - 3+ guests: "Anna Schmidt + 2 others"
 */
function formatGuestNames(
  bookingGuests: Array<{ guest: { name: string } }>,
): string {
  if (bookingGuests.length === 0) return 'Unknown Guest';
  if (bookingGuests.length === 1) return bookingGuests[0]!.guest.name;
  if (bookingGuests.length === 2) {
    return `${bookingGuests[0]!.guest.name} & ${bookingGuests[1]!.guest.name}`;
  }
  return `${bookingGuests[0]!.guest.name} + ${bookingGuests.length - 1} others`;
}

// ---------------------------------------------------------------------------
// Alert Formatters
// ---------------------------------------------------------------------------

/**
 * Format an alert message by type.
 * Each alert type produces a short, informative message for chat delivery.
 */
export function formatAlert(alertType: AlertType, details: Record<string, unknown>): string {
  switch (alertType) {
    case 'new-booking': {
      const sourceSuffix = details.source ? ` (via ${details.source})` : '';
      return `New booking received${sourceSuffix}! ${details.guestName} -- ${details.roomName}, ${details.checkIn} to ${details.checkOut} (${details.nights} nights, EUR ${formatEurCents(details.price as number)}).`;
    }

    case 'payment-confirmed':
      return `Payment confirmed: EUR ${formatEurCents(details.amount as number)} from ${details.guestName} for booking ${details.bookingId}.`;

    case 'guest-arriving':
      return `Guest arriving today: ${details.guestName} -- ${details.roomName}, checking in for ${details.nights} nights.`;

    case 'overdue-invoice':
      return `Overdue booking: ${details.guestName} checked out on ${details.checkOutDate}, EUR ${formatEurCents(details.amount as number)} outstanding.`;

    case 'draft-ready':
      return `New draft ready for ${details.guestName}'s inquiry. To review, ask: show latest draft for ${details.guestName}.`;

    default:
      return `Alert: ${JSON.stringify(details)}`;
  }
}

// ---------------------------------------------------------------------------
// Morning Briefing Processor
// ---------------------------------------------------------------------------

/**
 * Process the morning briefing job.
 * Queries dashboard stats and today's schedule, formats the briefing, and delivers via hook.
 */
export async function processMorningBriefing(app: FastifyInstance): Promise<void> {
  const { getStats, getToday } = await import('../dashboard/dashboard.service.js');

  const [stats, today] = await Promise.all([
    getStats(app.prisma),
    getToday(app.prisma),
  ]);

  // Calculate yesterday's revenue
  const todayStr = nicosiaToday();
  const todayDate = new Date(todayStr);
  todayDate.setDate(todayDate.getDate() - 1);
  const yesterdayStr = todayDate.toISOString().slice(0, 10);
  const yesterdayStart = utcMidnight(yesterdayStr);
  const yesterdayEnd = utcMidnight(todayStr);

  const yesterdayRevenueResult = await app.prisma.booking.aggregate({
    _sum: { totalPrice: true },
    where: {
      checkIn: { gte: yesterdayStart, lt: yesterdayEnd },
      status: { in: ['confirmed', 'checked_in', 'checked_out'] },
      deletedAt: null,
    },
  });
  const yesterdayRevenue = yesterdayRevenueResult._sum.totalPrice ?? 0;

  const isEmpty =
    today.checkIns.length === 0 &&
    today.checkOuts.length === 0 &&
    today.events.length === 0 &&
    stats.pendingInquiries === 0;

  const briefingData: BriefingData = {
    checkInsCount: today.checkIns.length,
    checkOutsCount: today.checkOuts.length,
    events: today.events.map((e) => ({
      time: e.time,
      title: e.title,
      registered: e.registeredCount,
      capacity: e.capacity,
    })),
    pendingInquiries: stats.pendingInquiries,
    yesterdayRevenue,
    isEmpty,
  };

  const message = formatBriefing(briefingData);
  await sendViaGateway(app, 'briefing', message);
}

// ---------------------------------------------------------------------------
// Guest Arrival Alert Processor
// ---------------------------------------------------------------------------

/**
 * Process guest arrival alerts.
 * Queries bookings checking in today and sends an alert for each arriving guest.
 */
export async function processGuestArrivalAlert(app: FastifyInstance): Promise<void> {
  const todayStr = nicosiaToday();
  const todayMidnight = utcMidnight(todayStr);

  const arrivingBookings = await app.prisma.booking.findMany({
    where: {
      checkIn: todayMidnight,
      status: { in: ['confirmed'] },
      deletedAt: null,
    },
    include: {
      guest: { select: { name: true } },
      bookingGuests: { include: { guest: { select: { name: true } } } },
      room: { select: { name: true } },
    },
  });

  if (arrivingBookings.length === 0) {
    app.log.info('No guest arrivals today, skipping arrival alerts');
    return;
  }

  for (const booking of arrivingBookings) {
    const guestName = booking.bookingGuests.length > 0
      ? formatGuestNames(booking.bookingGuests)
      : booking.guest.name;

    const checkInDate = booking.checkIn.toISOString().slice(0, 10);
    const checkOutDate = booking.checkOut.toISOString().slice(0, 10);
    const nights = Math.round(
      (booking.checkOut.getTime() - booking.checkIn.getTime()) / (1000 * 60 * 60 * 24),
    );

    const message = formatAlert('guest-arriving', {
      guestName,
      roomName: booking.room.name,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      nights,
    });

    await sendViaGateway(app, 'alert', message);
  }

  app.log.info({ count: arrivingBookings.length }, 'Guest arrival alerts sent');
}

// ---------------------------------------------------------------------------
// Overdue Invoice Alert Processor
// ---------------------------------------------------------------------------

/**
 * Process overdue invoice alerts.
 * Identifies bookings with outstanding balance (totalPrice - SUM(payments) > 0)
 * where check-in has arrived or passed. Includes confirmed, checked_in, checked_out,
 * and cancelled statuses -- any booking with a balance due triggers an alert.
 */
export async function processOverdueInvoiceAlert(app: FastifyInstance): Promise<void> {
  const todayStr = nicosiaToday();
  const todayMidnight = utcMidnight(todayStr);

  // Candidate bookings: check-in has arrived/passed, has a price
  // Include cancelled bookings (which have deletedAt set) -- they may still owe money
  const candidates = await app.prisma.booking.findMany({
    where: {
      totalPrice: { gt: 0 },
      checkIn: { lte: todayMidnight },
      status: { in: ['confirmed', 'checked_in', 'checked_out', 'cancelled'] },
    },
    include: {
      guest: { select: { name: true } },
      bookingGuests: { include: { guest: { select: { name: true } } } },
    },
  });

  if (candidates.length === 0) {
    app.log.info('No candidate bookings for overdue check');
    return;
  }

  // Batch fetch payment totals for all candidates
  const paymentSums = await app.prisma.payment.groupBy({
    by: ['bookingId'],
    _sum: { amount: true },
    where: {
      bookingId: { in: candidates.map(b => b.id) },
      deletedAt: null,
    },
  });
  const paidMap = new Map(paymentSums.map(p => [p.bookingId, p._sum.amount ?? 0]));

  // Filter to only bookings with outstanding balance
  const overdueBookings = candidates.filter(b => {
    const totalPaid = paidMap.get(b.id) ?? 0;
    return b.totalPrice - totalPaid > 0;
  });

  if (overdueBookings.length === 0) {
    app.log.info('No overdue bookings found (all candidates are fully paid)');
    return;
  }

  for (const booking of overdueBookings) {
    const guestName = booking.bookingGuests.length > 0
      ? formatGuestNames(booking.bookingGuests)
      : booking.guest.name;

    const checkOutDate = booking.checkOut.toISOString().slice(0, 10);
    const totalPaid = paidMap.get(booking.id) ?? 0;
    const balanceDue = booking.totalPrice - totalPaid;

    const message = formatAlert('overdue-invoice', {
      guestName,
      checkOutDate,
      amount: balanceDue,
    });

    await sendViaGateway(app, 'alert', message);
  }

  app.log.info({ count: overdueBookings.length }, 'Overdue invoice alerts sent');
}

// ---------------------------------------------------------------------------
// Event-Driven Alert Triggers
// ---------------------------------------------------------------------------

/**
 * Send a new booking alert.
 * Called after booking creation (fire-and-forget from route handler).
 */
export async function sendNewBookingAlert(
  app: FastifyInstance,
  bookingId: string,
): Promise<void> {
  const booking = await app.prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      guest: { select: { name: true } },
      bookingGuests: { include: { guest: { select: { name: true } } } },
      room: { select: { name: true } },
    },
  });

  if (!booking) {
    app.log.warn({ bookingId }, 'Booking not found for new-booking alert');
    return;
  }

  const guestName = booking.bookingGuests.length > 0
    ? formatGuestNames(booking.bookingGuests)
    : booking.guest.name;

  const checkInDate = booking.checkIn.toISOString().slice(0, 10);
  const checkOutDate = booking.checkOut.toISOString().slice(0, 10);
  const nights = Math.round(
    (booking.checkOut.getTime() - booking.checkIn.getTime()) / (1000 * 60 * 60 * 24),
  );

  const message = formatAlert('new-booking', {
    guestName,
    roomName: booking.room.name,
    checkIn: checkInDate,
    checkOut: checkOutDate,
    nights,
    price: booking.totalPrice,
    source: booking.source,
  });

  await sendViaGateway(app, 'alert', message);
}

/**
 * Send a draft-ready notification.
 * Called after AI draft generation completes (fire-and-forget from job processor).
 */
export async function sendDraftReadyNotification(
  app: FastifyInstance,
  conversationId: string,
  guestName: string,
): Promise<void> {
  const message = formatAlert('draft-ready', { guestName });
  await sendViaGateway(app, 'alert', message);
}

function formatInboxEmailNotification(details: InboxEmailNotificationDetails): string {
  const lines: string[] = [];
  lines.push('kind=inbox_email_alert_v1');
  lines.push(`conversationId=${details.conversationId}`);
  lines.push(`sender=${details.sender}`);
  lines.push(`subject=${details.subject}`);
  lines.push(`classification=${details.classification}`);
  lines.push(`receivedAt=${details.receivedAt}`);
  lines.push(`snippet=${details.snippet || '-'}`);
  lines.push(`inboxUrl=${details.inboxUrl}`);
  return lines.join('\n');
}

/**
 * Send a compact inbound inbox email notification to Telegram owner DM.
 */
export async function sendInboxEmailNotification(
  app: FastifyInstance,
  details: InboxEmailNotificationDetails,
): Promise<void> {
  const message = formatInboxEmailNotification(details);
  await sendViaGateway(app, 'alert', message);
}
