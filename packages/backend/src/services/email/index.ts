import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { EmailModuleContract, SendEmailParams } from '@pyr/shared';
import { QUEUE_NAMES } from '@pyr/shared';
import type { EmailPollJobData } from '@pyr/shared';
import { ImapFlow } from 'imapflow';
import { createImapService, type ImapConfig } from './imap.service.js';
import { createSmtpService, type SmtpConfig } from './smtp.service.js';
import { parseEmail } from './email-parser.js';
import { findConversationByHeaders, isForwardedEmail } from './email-threader.js';
import { classifyEmail } from './email-classifier.js';
import { matchOrCreateGuest } from './contact-matcher.js';
import { getSetting } from '../../modules/settings/settings.service.js';
import { writeAuditLog } from '../../lib/audit.js';

// ─── Types ──────────────────────────────────────────────────

export interface EmailModuleInstance extends EmailModuleContract {
  /** Poll inbox for new emails and process them through the full pipeline */
  pollInbox(): Promise<number>;
}

// ─── Constants ──────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MS = 120_000; // 2 minutes
const MIN_POLL_INTERVAL_MS = 30_000;
const DEFAULT_SIGNATURE = 'Best regards,\nInes Brendel\nPuppy Yoga Retreat';
const IMAP_HEALTH_TIMEOUT_MS = 10_000;

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
  const imapConfig: ImapConfig = {
    host: process.env.IMAP_HOST ?? 'imap.gmx.net',
    port: Number(process.env.IMAP_PORT ?? '993'),
    user: process.env.EMAIL_USER ?? '',
    pass: process.env.EMAIL_PASS ?? '',
    secure: true,
  };

  const smtpConfig: SmtpConfig = {
    host: process.env.SMTP_HOST ?? 'mail.gmx.net',
    port: Number(process.env.SMTP_PORT ?? '587'),
    user: process.env.EMAIL_USER ?? '',
    pass: process.env.EMAIL_PASS ?? '',
    secure: false, // STARTTLS
  };

  // Cast FastifyBaseLogger to pino Logger -- Fastify's logger IS pino, but the type
  // declarations diverge slightly (missing msgPrefix). Safe at runtime.
  const logger = app.log as unknown as Logger;
  const imapService = createImapService(logger);
  const smtpService = createSmtpService(smtpConfig, logger);

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

        // g. Write audit log
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

        // h. Update last processed UID
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
   */
  async function startPolling(): Promise<void> {
    const emailPollQueue = app.queues.getQueue(QUEUE_NAMES.EMAIL_POLL);
    if (!emailPollQueue) {
      app.log.warn('Email poll queue not found -- cannot start polling');
      return;
    }

    let intervalMs = DEFAULT_POLL_INTERVAL_MS;
    try {
      const setting = await getSetting(app.prisma, 'email_poll_interval_ms');
      const parsed = Number(setting.value);
      if (!Number.isNaN(parsed) && parsed >= MIN_POLL_INTERVAL_MS) {
        intervalMs = parsed;
      }
    } catch {
      // Use default
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
    // Get email signature from settings
    let signature = DEFAULT_SIGNATURE;
    try {
      const setting = await getSetting(app.prisma, 'email_signature');
      if (typeof setting.value === 'string' && setting.value.length > 0) {
        signature = setting.value;
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
    let imap = false;
    let smtp = false;

    // Test IMAP: connect and immediately disconnect
    try {
      const client = new ImapFlow({
        host: imapConfig.host,
        port: imapConfig.port,
        secure: imapConfig.secure ?? true,
        auth: {
          user: imapConfig.user,
          pass: imapConfig.pass,
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
