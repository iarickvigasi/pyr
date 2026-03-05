import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { EmailModuleContract, SendEmailParams } from '@pyr/shared';
import { QUEUE_NAMES } from '@pyr/shared';
import type { EmailPollJobData, AiDraftJobData, ViatorEventAnalysisJobData } from '@pyr/shared';
import { ImapFlow } from 'imapflow';
import { createImapService, type ImapConfig } from './imap.service.js';
import { createSmtpService, type SmtpConfig } from './smtp.service.js';
import { parseEmail } from './email-parser.js';
import { findConversationByHeaders, isForwardedEmail } from './email-threader.js';
import { classifyEmailWithOpenClaw } from './openclaw-classifier.js';
import { matchGuestByEmail, matchGuestByEmailOrName } from './contact-matcher.js';
import { getSetting } from '../../modules/settings/settings.service.js';
import { getEmailProviderConfig } from '../../modules/settings/settings.service.js';
import { writeAuditLog } from '../../lib/audit.js';
import { parseOtaEmail } from './ota-parsers/index.js';
import { detectLanguage } from './language-detector.js';
import {
  isConversationClassification,
  isConversationOrOtaClassification,
} from './inbox-classification.js';
import { upsertConversationEventAnalysisPending } from '../../modules/inbox/conversation-event.service.js';
import { nicosiaToday } from '../../lib/date-helpers.js';

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

function isViatorAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const normalized = address.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex < 0) return false;
  const domain = normalized.slice(atIndex + 1);
  return domain.endsWith('viator.com');
}

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

/**
 * Resolve the minimum allowed inbound email date for polling/ingestion.
 *
 * Supported values for EMAIL_POLL_MIN_DATE:
 * - `today` (business timezone: Europe/Nicosia)
 * - `YYYY-MM-DD`
 *
 * If unset or invalid, no date filter is applied.
 */
async function resolveEmailPollMinDate(
  app: FastifyInstance,
): Promise<Date | undefined> {
  let raw: string | undefined;

  try {
    const setting = await getSetting(app.prisma, 'email_poll_min_date');
    if (typeof setting.value === 'string') {
      raw = setting.value.trim();
    }
  } catch {
    // Optional setting not found -- fall back to env var.
  }

  if (!raw) {
    raw = process.env.EMAIL_POLL_MIN_DATE?.trim();
  }

  if (!raw) return undefined;

  if (raw.toLowerCase() === 'today') {
    const today = nicosiaToday();
    return new Date(`${today}T00:00:00.000Z`);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00.000Z`);
  }

  app.log.warn(
    { value: raw },
    'Invalid EMAIL_POLL_MIN_DATE, expected "today" or YYYY-MM-DD; ignoring filter',
  );
  return undefined;
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
    const minPollDate = await resolveEmailPollMinDate(app);

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
    const rawEmails = await imapService.pollNewEmails(imapConfig, lastUid, minPollDate);

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

        // Hard safety gate at ingestion stage (in addition to IMAP `since` filter):
        // never ingest emails older than EMAIL_POLL_MIN_DATE.
        if (minPollDate && parsed.date < minPollDate) {
          app.log.info(
            {
              uid: raw.uid,
              messageId: parsed.messageId || null,
              emailDate: parsed.date.toISOString(),
              minPollDate: minPollDate.toISOString(),
            },
            'Skipping inbound email older than configured min poll date',
          );
          await upsertLastUid(raw.uid);
          continue;
        }

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

        // c. Threading lookup before classification so we can pass recent thread context
        const existingConversationId = isForwardedEmail(parsed.subject)
          ? null
          : await findConversationByHeaders(
              app.prisma,
              parsed.inReplyTo,
              parsed.references,
            );

        const recentMessages = existingConversationId
          ? await app.prisma.message.findMany({
              where: { conversationId: existingConversationId },
              orderBy: { sentAt: 'desc' },
              take: 4,
              select: { direction: true, content: true },
            })
          : [];

        // d. OpenClaw-first classification with deterministic fallback
        const classification = await classifyEmailWithOpenClaw({
          gateway: app.gateway,
          parsed,
          conversationId: existingConversationId ?? undefined,
          recentMessages: recentMessages
            .reverse()
            .map((m) => ({ direction: m.direction, content: m.content })),
          logger: app.log,
        });

        // e. Match guest (existing records only, never auto-create here)
        const otaData = isConversationOrOtaClassification(classification.category)
          ? parseOtaEmail(parsed.from.address, parsed.subject, parsed.html, parsed.text)
          : null;

        const suggestedEmail = classification.suggestion.email;
        const suggestedName = classification.suggestion.name;

        let matchedGuestId: string | null = null;
        if (isConversationClassification(classification.category)) {
          matchedGuestId = await matchGuestByEmail(
            app.prisma,
            suggestedEmail ?? parsed.from.address,
          );
        } else if (classification.category.startsWith('ota_') || classification.category === 'ota_notification') {
          matchedGuestId = await matchGuestByEmailOrName(app.prisma, {
            email: suggestedEmail ?? otaData?.guestEmail ?? null,
            name: suggestedName ?? otaData?.guestName ?? null,
          });
        }

        // f. Upsert conversation (threaded update or create)
        let conversationId = existingConversationId;
        let linkedGuestId = matchedGuestId;

        if (conversationId) {
          const existingConversation = await app.prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { guestId: true },
          });

          const conversationUpdate: Record<string, unknown> = {
            lastMessageAt: parsed.date,
            classification: classification.category,
            subject: parsed.subject,
            isRead: false,
          };

          if (!existingConversation?.guestId && matchedGuestId) {
            conversationUpdate['guestId'] = matchedGuestId;
          } else {
            linkedGuestId = existingConversation?.guestId ?? null;
          }

          await app.prisma.conversation.update({
            where: { id: conversationId },
            data: conversationUpdate,
          });
        } else {
          const conversation = await app.prisma.conversation.create({
            data: {
              guestId: matchedGuestId,
              channel: 'email',
              subject: parsed.subject,
              classification: classification.category,
              lastMessageAt: parsed.date,
              isRead: false,
            },
          });
          conversationId = conversation.id;
          linkedGuestId = conversation.guestId;
        }

        if (!conversationId) {
          throw new Error('Conversation resolution failed');
        }

        // g. Store message
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

        // h. Store attachments
        if (parsed.attachments.length > 0) {
          for (const att of parsed.attachments) {
            await app.prisma.attachment.create({
              data: {
                messageId: message.id,
                filename: att.filename,
                contentType: att.contentType,
                size: att.size,
                contentId: att.contentId ?? null,
                data: Buffer.from(att.content),
              },
            });
          }
        }

        // i. Write audit log for message
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
            classificationSource: classification.source,
            trigger: 'email-poll',
          },
          actor: 'system',
        });

        // j. Enqueue background Viator event analysis (auto-analyze, manual apply).
        if (isViatorAddress(parsed.from.address)) {
          try {
            await upsertConversationEventAnalysisPending(app.prisma, {
              conversationId,
              messageId: message.id,
              classification: classification.category,
              reason: 'Queued from inbound Viator email ingestion',
            });

            const viatorAnalysisQueue = app.queues?.getQueue(QUEUE_NAMES.VIATOR_EVENT_ANALYSIS);
            if (viatorAnalysisQueue) {
              await viatorAnalysisQueue.add('viator-event-analysis', {
                conversationId,
                messageId: message.id,
              } satisfies ViatorEventAnalysisJobData, {
                jobId: `viator-event-analysis:${message.id}`,
              });
            } else {
              app.log.error(
                { conversationId, messageId: message.id },
                'Viator event analysis queue not found',
              );
            }
          } catch (viatorErr) {
            // Non-blocking: inbound email storage must not fail due to analysis queueing.
            app.log.warn(
              { err: viatorErr, conversationId, messageId: message.id },
              'Failed to queue Viator event analysis',
            );
          }
        }

        // k. Enqueue AI draft generation for customer conversations.
        if (isConversationClassification(classification.category)) {
          try {
            const aiDraftQueue = app.queues?.getQueue(QUEUE_NAMES.AI_DRAFT);
            if (aiDraftQueue) {
              const resolvedGuestId = linkedGuestId ?? matchedGuestId;

              let guestLanguage: 'en' | 'de' = 'en';
              if (resolvedGuestId) {
                const guest = await app.prisma.guest.findUnique({
                  where: { id: resolvedGuestId },
                  select: { language: true },
                });
                guestLanguage = guest?.language === 'de' ? 'de' : 'en';
              } else {
                guestLanguage = detectLanguage(parsed.text) === 'de' ? 'de' : 'en';
              }

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
        } else {
          app.log.info(
            { classification: classification.category, reason: classification.reason },
            'Email classified as non-conversation -- AI draft skipped',
          );
        }

        // l. Update last processed UID
        await upsertLastUid(raw.uid);

        processed++;
        app.log.info(
          {
            uid: raw.uid,
            messageId: parsed.messageId,
            conversationId,
            classification: classification.category,
            guestId: linkedGuestId ?? matchedGuestId,
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
