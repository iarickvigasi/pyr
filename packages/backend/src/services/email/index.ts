import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { EmailModuleContract, SendEmailParams } from '@pyr/shared';
import { QUEUE_NAMES } from '@pyr/shared';
import type { EmailPollJobData, AiDraftJobData, CalendarSyncJobData } from '@pyr/shared';
import { ImapFlow } from 'imapflow';
import { createImapService, type ImapConfig } from './imap.service.js';
import { createSmtpService, type SmtpConfig } from './smtp.service.js';
import { parseEmail } from './email-parser.js';
import { findConversationByHeaders, isForwardedEmail } from './email-threader.js';
import { classifyEmail } from './email-classifier.js';
import { matchOrCreateGuest } from './contact-matcher.js';
import { getSetting } from '../../modules/settings/settings.service.js';
import { getEmailProviderConfig } from '../../modules/settings/settings.service.js';
import { writeAuditLog } from '../../lib/audit.js';
import { parseOtaEmail } from './ota-parsers/index.js';
import { sendNewBookingAlert } from '../../modules/notifications/notification.service.js';

// ─── Types ──────────────────────────────────────────────────

export interface EmailModuleInstance extends EmailModuleContract {
  /** Poll inbox for new emails and process them through the full pipeline */
  pollInbox(): Promise<number>;
}

interface ResolvedEmailConfig {
  imapConfig: ImapConfig;
  smtpConfig: SmtpConfig;
  pollIntervalMs: number;
  pollingEnabled: boolean;
}

// ─── Constants ──────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MS = 120_000; // 2 minutes
const MIN_POLL_INTERVAL_MS = 30_000;
const DEFAULT_SIGNATURE = 'Best regards,\nInes Brendel\nPuppy Yoga Retreat';
const IMAP_HEALTH_TIMEOUT_MS = 10_000;

// ─── Config Resolution ──────────────────────────────────────

/**
 * Read email config from the settings table (if stored), otherwise
 * fall back to environment variables.
 */
async function resolveEmailConfig(app: FastifyInstance): Promise<ResolvedEmailConfig> {
  // Try settings table first
  try {
    const dbConfig = await getEmailProviderConfig(app.prisma);
    if (dbConfig && dbConfig.email) {
      return {
        imapConfig: {
          host: dbConfig.imapHost,
          port: dbConfig.imapPort,
          user: dbConfig.email,
          pass: dbConfig.password,
          secure: true,
        },
        smtpConfig: {
          host: dbConfig.smtpHost,
          port: dbConfig.smtpPort,
          user: dbConfig.email,
          pass: dbConfig.password,
          secure: false,
        },
        pollIntervalMs: Math.max(
          dbConfig.pollIntervalMinutes * 60_000,
          MIN_POLL_INTERVAL_MS,
        ),
        pollingEnabled: dbConfig.pollingEnabled,
      };
    }
  } catch {
    // Settings-based config not available -- fall back to env vars
  }

  // Fall back to environment variables
  return {
    imapConfig: {
      host: process.env.IMAP_HOST ?? 'imap.gmx.net',
      port: Number(process.env.IMAP_PORT ?? '993'),
      user: process.env.EMAIL_USER ?? '',
      pass: process.env.EMAIL_PASS ?? '',
      secure: true,
    },
    smtpConfig: {
      host: process.env.SMTP_HOST ?? 'mail.gmx.net',
      port: Number(process.env.SMTP_PORT ?? '587'),
      user: process.env.EMAIL_USER ?? '',
      pass: process.env.EMAIL_PASS ?? '',
      secure: false,
    },
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    pollingEnabled: true,
  };
}

// ─── Factory ────────────────────────────────────────────────

/**
 * Email integration module.
 * Provides IMAP polling, email parsing, and SMTP sending.
 *
 * Cross-module communication:
 * - Receives: email-poll jobs from BullMQ scheduler
 * - Produces: conversations and messages in the database
 */
export function createEmailModule(app: FastifyInstance): EmailModuleInstance {
  // Cast FastifyBaseLogger to pino Logger -- Fastify's logger IS pino, but the type
  // declarations diverge slightly (missing msgPrefix). Safe at runtime.
  const logger = app.log as unknown as Logger;
  const imapService = createImapService(logger);

  // SMTP service and config are lazily resolved per-call to support dynamic config changes
  let cachedSmtpService: ReturnType<typeof createSmtpService> | null = null;
  let cachedSmtpConfig: SmtpConfig | null = null;

  async function getSmtpService(): Promise<ReturnType<typeof createSmtpService>> {
    const config = await resolveEmailConfig(app);
    // Only recreate if config changed
    if (
      cachedSmtpService &&
      cachedSmtpConfig &&
      cachedSmtpConfig.host === config.smtpConfig.host &&
      cachedSmtpConfig.port === config.smtpConfig.port &&
      cachedSmtpConfig.user === config.smtpConfig.user &&
      cachedSmtpConfig.pass === config.smtpConfig.pass
    ) {
      return cachedSmtpService;
    }
    cachedSmtpConfig = config.smtpConfig;
    cachedSmtpService = createSmtpService(config.smtpConfig, logger);
    return cachedSmtpService;
  }

  /**
   * Poll inbox for new emails and process them through the full pipeline:
   * IMAP fetch -> parse -> dedupe -> classify -> match guest -> thread -> store
   *
   * Each email is processed independently -- one failure does not block others.
   * Last processed IMAP UID is stored in settings table for incremental polling.
   *
   * @returns Count of successfully processed emails
   */
  async function pollInbox(): Promise<number> {
    // Resolve config (settings table with env var fallback)
    const config = await resolveEmailConfig(app);

    // Check if polling is enabled
    if (!config.pollingEnabled) {
      app.log.debug('Email polling is disabled -- skipping');
      return 0;
    }

    const imapConfig = config.imapConfig;

    // 1. Read last processed UID from settings
    let lastUid: number | undefined;
    try {
      const setting = await getSetting(app.prisma, 'imap_last_uid');
      const parsed = Number(setting.value);
      if (!Number.isNaN(parsed) && parsed > 0) {
        lastUid = parsed;
      }
    } catch {
      // Setting not found -- first run, fetch all unseen
      app.log.info('imap_last_uid not found, fetching unseen messages');
    }

    // 2. Fetch raw emails via IMAP
    const rawEmails = await imapService.pollNewEmails(imapConfig, lastUid);

    if (rawEmails.length === 0) {
      app.log.debug('Email poll: no new messages');
      return 0;
    }

    app.log.info({ count: rawEmails.length }, 'Email poll: processing new messages');

    let processed = 0;

    // 3. Process each email independently
    for (const raw of rawEmails) {
      try {
        // a. Parse MIME source
        const parsed = await parseEmail(raw.source);

        // b. Deduplicate by Message-ID
        if (parsed.messageId) {
          const existing = await app.prisma.message.findFirst({
            where: { messageId: parsed.messageId },
            select: { id: true },
          });
          if (existing) {
            app.log.debug({ messageId: parsed.messageId }, 'Skipping duplicate email');
            // Still update lastUid so we don't re-fetch this email
            await upsertLastUid(raw.uid);
            continue;
          }
        }

        // c. Classify
        const classification = classifyEmail(parsed.from, parsed.subject);

        // d. Match or create guest
        const guestId = await matchOrCreateGuest(
          app.prisma,
          parsed.from,
          parsed.text,
          classification.category,
        );

        // e. Thread: determine conversation
        let conversationId: string;

        if (isForwardedEmail(parsed.subject)) {
          // Forwarded emails always create a new conversation
          const conversation = await app.prisma.conversation.create({
            data: {
              guestId,
              channel: 'email',
              subject: parsed.subject,
              classification: classification.category,
              lastMessageAt: parsed.date,
            },
          });
          conversationId = conversation.id;
        } else {
          // Try to find existing conversation by threading headers
          const existingConversationId = await findConversationByHeaders(
            app.prisma,
            parsed.inReplyTo,
            parsed.references,
          );

          if (existingConversationId) {
            conversationId = existingConversationId;
            // Update lastMessageAt
            await app.prisma.conversation.update({
              where: { id: conversationId },
              data: { lastMessageAt: parsed.date },
            });
          } else {
            // Create new conversation
            const conversation = await app.prisma.conversation.create({
              data: {
                guestId,
                channel: 'email',
                subject: parsed.subject,
                classification: classification.category,
                lastMessageAt: parsed.date,
              },
            });
            conversationId = conversation.id;
          }
        }

        // f. Store message
        const message = await app.prisma.message.create({
          data: {
            conversationId,
            direction: 'in',
            content: parsed.text,
            channel: 'email',
            messageId: parsed.messageId || null,
            inReplyTo: parsed.inReplyTo ?? null,
            references: parsed.references.join(' ') || null,
            htmlContent: parsed.html || null,
            rawSource: Buffer.from(raw.source),
            fromAddress: parsed.from.address,
            fromName: parsed.from.name,
            subject: parsed.subject,
            classification: classification.category,
            sentAt: parsed.date,
          },
        });

        // f2. Store attachments
        if (parsed.attachments.length > 0) {
          for (const att of parsed.attachments) {
            await app.prisma.attachment.create({
              data: {
                messageId: message.id,
                filename: att.filename,
                contentType: att.contentType,
                size: att.size,
                contentId: att.contentId ?? null,
                // Prisma Bytes expects Buffer; cast through unknown to satisfy strict TS
              data: Buffer.from(att.content.buffer, att.content.byteOffset, att.content.byteLength) as Buffer<ArrayBuffer>,
              },
            });
          }
        }

        // f3. Mark conversation as unread (new inbound message)
        await app.prisma.conversation.update({
          where: { id: conversationId },
          data: { isRead: false },
        });

        // g. OTA booking auto-creation
        if (classification.category === 'ota_notification') {
          try {
            const senderDomain = parsed.from.address.split('@').pop()?.toLowerCase() ?? '';
            const otaData = parseOtaEmail(
              parsed.from.address,
              parsed.subject,
              parsed.html || '',
              parsed.text,
            );

            if (otaData) {
              // Match or create guest from OTA data (use guest email/name, not OTA sender)
              let otaGuestId: string | null = null;
              if (otaData.guestEmail) {
                const existingGuest = await app.prisma.guest.findFirst({
                  where: { email: otaData.guestEmail, deletedAt: null },
                });
                if (existingGuest) {
                  otaGuestId = existingGuest.id;
                }
              }

              if (!otaGuestId && otaData.guestName) {
                // Try name match as fallback
                const nameGuest = await app.prisma.guest.findFirst({
                  where: { name: otaData.guestName, deletedAt: null },
                });
                if (nameGuest) {
                  otaGuestId = nameGuest.id;
                }
              }

              if (!otaGuestId && (otaData.guestName || otaData.guestEmail)) {
                // Create new guest
                const newGuest = await app.prisma.$transaction(async (tx) => {
                  const guest = await tx.guest.create({
                    data: {
                      name: otaData.guestName ?? otaData.guestEmail?.split('@')[0] ?? 'Unknown',
                      email: otaData.guestEmail ?? null,
                      source: otaData.otaPlatform,
                    },
                  });
                  await writeAuditLog(tx, {
                    entityType: 'guest',
                    entityId: guest.id,
                    action: 'create',
                    changes: {
                      name: guest.name,
                      email: guest.email,
                      source: otaData.otaPlatform,
                      trigger: 'ota-email-parse',
                    },
                    actor: 'system',
                  });
                  return guest;
                });
                otaGuestId = newGuest.id;
              }

              if (otaGuestId) {
                // Pick first available room (Ines will reassign)
                const room = await app.prisma.room.findFirst({
                  where: { status: 'available' },
                  orderBy: { name: 'asc' },
                });

                if (room) {
                  // Parse dates or use placeholders
                  let checkInDate: Date;
                  let checkOutDate: Date;

                  if (otaData.checkIn) {
                    checkInDate = new Date(otaData.checkIn);
                    if (isNaN(checkInDate.getTime())) {
                      // Placeholder: date string not parseable, needsReview=true
                      checkInDate = new Date();
                    }
                  } else {
                    // Placeholder: actual date missing from OTA email, needsReview=true
                    checkInDate = new Date();
                  }

                  if (otaData.checkOut) {
                    checkOutDate = new Date(otaData.checkOut);
                    if (isNaN(checkOutDate.getTime())) {
                      // Placeholder: date string not parseable, needsReview=true
                      checkOutDate = new Date(Date.now() + 86_400_000);
                    }
                  } else {
                    // Placeholder: actual date missing from OTA email, needsReview=true
                    checkOutDate = new Date(Date.now() + 86_400_000);
                  }

                  // Ensure checkOut > checkIn
                  if (checkOutDate <= checkInDate) {
                    checkOutDate = new Date(checkInDate.getTime() + 86_400_000);
                  }

                  const booking = await app.prisma.$transaction(async (tx) => {
                    const newBooking = await tx.booking.create({
                      data: {
                        guestId: otaGuestId!,
                        roomId: room.id,
                        checkIn: checkInDate,
                        checkOut: checkOutDate,
                        status: 'inquiry',
                        totalPrice: otaData.totalPrice ?? 0,
                        source: otaData.otaPlatform,
                        sourceConversationId: conversationId,
                        needsReview: otaData.needsReview,
                        notes: JSON.stringify(otaData.rawFields),
                      },
                    });

                    // Write junction table row for consistent multi-guest data
                    await tx.bookingGuest.create({
                      data: {
                        bookingId: newBooking.id,
                        guestId: otaGuestId!,
                      },
                    });

                    await writeAuditLog(tx, {
                      entityType: 'booking',
                      entityId: newBooking.id,
                      action: 'create',
                      changes: {
                        guestId: otaGuestId,
                        source: otaData.otaPlatform,
                        otaReferenceId: otaData.otaReferenceId,
                        needsReview: otaData.needsReview,
                        conversationId,
                        trigger: 'ota-email-parse',
                      },
                      actor: 'system',
                    });

                    return newBooking;
                  });

                  app.log.info(
                    {
                      bookingId: booking.id,
                      otaPlatform: otaData.otaPlatform,
                      needsReview: otaData.needsReview,
                      conversationId,
                    },
                    'OTA booking auto-created from email',
                  );

                  // Fire-and-forget alert (best-effort, never blocks email processing)
                  sendNewBookingAlert(app, booking.id).catch(err =>
                    app.log.error({ err }, 'Failed to send OTA new booking alert'),
                  );

                  // Enqueue calendar sync for OTA-created booking
                  const calQueue = app.queues?.getQueue(QUEUE_NAMES.CALENDAR_SYNC);
                  if (calQueue) {
                    try {
                      await calQueue.add('calendar-sync', {
                        entityType: 'booking',
                        entityId: booking.id,
                        action: 'create',
                      } satisfies CalendarSyncJobData);
                    } catch (syncErr) {
                      app.log.error({ err: syncErr, bookingId: booking.id }, 'Failed to enqueue calendar sync for OTA booking');
                    }
                  }
                } else {
                  app.log.warn(
                    { conversationId, otaPlatform: otaData.otaPlatform },
                    'No available room for OTA booking -- skipping auto-creation',
                  );
                }
              }
            }
          } catch (otaErr) {
            // OTA parsing failure should not prevent email processing
            app.log.warn(
              { error: otaErr, conversationId },
              'OTA parsing/booking creation failed -- email still stored',
            );
          }
        }

        // h. Write audit log for message
        await writeAuditLog(app.prisma, {
          entityType: 'message',
          entityId: message.id,
          action: 'create',
          changes: {
            conversationId,
            direction: 'in',
            channel: 'email',
            fromAddress: parsed.from.address,
            classification: classification.category,
            trigger: 'email-poll',
          },
          actor: 'system',
        });

        // i. Enqueue AI draft generation for guest emails
        if (classification.category === 'guest_inquiry' && guestId) {
          try {
            const aiDraftQueue = app.queues?.getQueue(QUEUE_NAMES.AI_DRAFT);
            if (aiDraftQueue) {
              const guest = await app.prisma.guest.findUnique({
                where: { id: guestId },
                select: { language: true },
              });
              const guestLanguage = (guest?.language === 'de' ? 'de' : 'en') as 'en' | 'de';

              await aiDraftQueue.add('ai-draft', {
                conversationId,
                messageId: message.id,
                guestLanguage,
              } satisfies AiDraftJobData);

              app.log.info(
                { conversationId, messageId: message.id, guestLanguage },
                'AI draft job enqueued',
              );
            } else {
              app.log.error(
                { conversationId },
                'AI draft queue not found -- queue infrastructure may not be initialized',
              );
            }
          } catch (draftErr) {
            // Draft enqueueing failure must NOT block email processing
            app.log.warn({ error: draftErr, conversationId }, 'Failed to enqueue AI draft job');
          }
        } else if (classification.category !== 'guest_inquiry') {
          app.log.info(
            { classification: classification.category, reason: classification.reason },
            'Email classified as non-inquiry -- no AI draft generated',
          );
        } else if (!guestId) {
          app.log.info(
            { classification: classification.category },
            'No guest matched for email -- no AI draft generated',
          );
        }

        // j. Update last processed UID
        await upsertLastUid(raw.uid);

        processed++;
        app.log.info(
          {
            uid: raw.uid,
            messageId: parsed.messageId,
            conversationId,
            classification: classification.category,
            guestId,
          },
          'Email processed successfully',
        );
      } catch (err) {
        app.log.error(
          { uid: raw.uid, error: err },
          'Failed to process email -- continuing with remaining messages',
        );
        // Continue processing remaining emails
      }
    }

    app.log.info({ processed, total: rawEmails.length }, 'Email poll batch complete');
    return processed;
  }

  /**
   * Upsert the last processed IMAP UID in the settings table.
   */
  async function upsertLastUid(uid: number): Promise<void> {
    await app.prisma.setting.upsert({
      where: { key: 'imap_last_uid' },
      create: { key: 'imap_last_uid', value: uid },
      update: { value: uid },
    });
  }

  /**
   * Start the email poll scheduler via BullMQ.
   * Reads poll interval from settings table (default 2 minutes, minimum 30 seconds).
   * Respects the pollingEnabled flag from email provider config.
   */
  async function startPolling(): Promise<void> {
    // Check if polling is enabled
    const config = await resolveEmailConfig(app);
    if (!config.pollingEnabled) {
      app.log.info('Email polling is disabled -- not starting scheduler');
      return;
    }

    const emailPollQueue = app.queues.getQueue(QUEUE_NAMES.EMAIL_POLL);
    if (!emailPollQueue) {
      app.log.warn('Email poll queue not found -- cannot start polling');
      return;
    }

    let intervalMs = config.pollIntervalMs;
    // Also check the explicit setting (takes priority if set)
    try {
      const setting = await getSetting(app.prisma, 'email_poll_interval_ms');
      const parsed = Number(setting.value);
      if (!Number.isNaN(parsed) && parsed >= MIN_POLL_INTERVAL_MS) {
        intervalMs = parsed;
      }
    } catch {
      // Use config-derived interval
    }

    await emailPollQueue.upsertJobScheduler('email-poll-scheduler', {
      every: intervalMs,
    }, {
      name: 'email-poll',
      data: {} satisfies EmailPollJobData,
    });

    app.log.info({ intervalMs }, 'Email poll scheduler started');
  }

  /**
   * Stop the email poll scheduler.
   */
  async function stopPolling(): Promise<void> {
    const emailPollQueue = app.queues.getQueue(QUEUE_NAMES.EMAIL_POLL);
    if (!emailPollQueue) {
      return;
    }

    await emailPollQueue.removeJobScheduler('email-poll-scheduler');
    app.log.info('Email poll scheduler stopped');
  }

  /**
   * Send an email via SMTP with threading headers.
   * Loads email signature from settings table with fallback default.
   */
  async function sendEmail(params: SendEmailParams): Promise<{ messageId: string }> {
    const smtpService = await getSmtpService();

    // Get email signature from settings
    let signature = DEFAULT_SIGNATURE;
    try {
      const setting = await getSetting(app.prisma, 'email_signature');
      if (typeof setting.value === 'string' && setting.value.length > 0) {
        signature = setting.value;
      } else if (
        typeof setting.value === 'object' &&
        setting.value !== null &&
        'html' in (setting.value as Record<string, unknown>)
      ) {
        // Support HTML signatures from Tiptap editor
        signature = (setting.value as Record<string, unknown>).html as string;
      } else if (
        typeof setting.value === 'object' &&
        setting.value !== null &&
        'text' in (setting.value as Record<string, unknown>)
      ) {
        signature = (setting.value as Record<string, unknown>).text as string;
      }
    } catch {
      // Use default signature
    }

    const htmlContent = params.html ?? params.body;
    let messageId: string;

    if (params.inReplyTo) {
      // Reply with threading headers
      messageId = await smtpService.sendReply({
        to: params.to,
        subject: params.subject,
        html: htmlContent,
        inReplyTo: params.inReplyTo,
        references: params.references,
      }, signature);
    } else {
      // New email (no threading)
      messageId = await smtpService.sendNew({
        to: params.to,
        subject: params.subject,
        html: htmlContent,
      }, signature);
    }

    return { messageId };
  }

  /**
   * Check if IMAP and SMTP connections are healthy.
   */
  async function healthCheck(): Promise<{ imap: boolean; smtp: boolean }> {
    const config = await resolveEmailConfig(app);
    let imap = false;
    let smtp = false;

    // Test IMAP: connect and immediately disconnect
    try {
      const client = new ImapFlow({
        host: config.imapConfig.host,
        port: config.imapConfig.port,
        secure: config.imapConfig.secure ?? true,
        auth: {
          user: config.imapConfig.user,
          pass: config.imapConfig.pass,
        },
        logger: false,
        connectionTimeout: IMAP_HEALTH_TIMEOUT_MS,
        greetingTimeout: IMAP_HEALTH_TIMEOUT_MS,
      });

      await client.connect();
      await client.logout();
      imap = true;
    } catch (err) {
      app.log.error({ err }, 'IMAP health check failed');
    }

    // Test SMTP
    try {
      const smtpService = await getSmtpService();
      smtp = await smtpService.verifyConnection();
    } catch (err) {
      app.log.error({ err }, 'SMTP health check failed');
    }

    return { imap, smtp };
  }

  return {
    pollInbox,
    startPolling,
    stopPolling,
    sendEmail,
    healthCheck,
  };
}
