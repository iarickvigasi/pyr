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

// ---------------------------------------------------------------------------
// Gateway Delivery
// ---------------------------------------------------------------------------

/**
 * Send a message to the OpenClaw Gateway via WebSocket agent RPC.
 * Replicates the hook mapping behavior from openclaw.json:
 * - briefing: deliver=true, sessionKey=hook:briefing
 * - alert:    deliver=true, sessionKey=hook:alert
 * - draft:    deliver=false, sessionKey=hook:draft:<timestamp>
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
    const sessionKey = hookPath === 'draft'
      ? `hook:draft:${Date.now()}`
      : `hook:${hookPath}`;

    await app.gateway.request('agent', {
      message,
      agentId: 'main',
      sessionKey,
      deliver,
      idempotencyKey: crypto.randomUUID(),
    });
    app.log.info({ hookPath }, 'Gateway agent request sent');
  } catch (err) {
    app.log.error({ err, hookPath }, 'Gateway agent request failed');
  }
}

// ---------------------------------------------------------------------------
// Briefing Formatter
// ---------------------------------------------------------------------------

/**
 * Format a briefing message for WhatsApp delivery.
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
 * Each alert type produces a short, informative message for WhatsApp delivery.
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
      return `New draft ready for ${details.guestName}'s inquiry. Reply 'Show' to review.`;

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
 * Send a new booking alert via WhatsApp.
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
 * Send a draft-ready notification via WhatsApp.
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
