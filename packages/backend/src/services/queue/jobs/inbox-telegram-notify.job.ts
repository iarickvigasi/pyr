import type { Job } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import type { InboxTelegramNotifyJobData } from '@pyr/shared';
import { normalizePrimaryClassification } from '../../email/inbox-classification.js';
import { sendInboxEmailNotification } from '../../../modules/notifications/notification.service.js';

function sanitizeSnippet(value: string, maxLen = 240): string {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  if (!singleLine) return '';
  if (singleLine.length <= maxLen) return singleLine;
  return `${singleLine.slice(0, maxLen - 1)}...`;
}

function buildInboxConversationUrl(baseUrl: string, conversationId: string): string {
  const normalized = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalized}/inbox?conversation=${encodeURIComponent(conversationId)}`;
}

export function createInboxTelegramNotifyProcessor(app: FastifyInstance) {
  return async (job: Job<InboxTelegramNotifyJobData>): Promise<void> => {
    const { conversationId, messageId, classification } = job.data;
    const logger = app.log.child({
      queue: 'inbox-telegram-notify',
      jobId: job.id,
      conversationId,
      messageId,
    });

    logger.info('inbox_telegram_notify_started');

    const message = await app.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: {
        id: true,
        fromAddress: true,
        fromName: true,
        subject: true,
        content: true,
        sentAt: true,
        classification: true,
      },
    });

    if (!message) {
      logger.warn('inbox_telegram_notify_skipped_message_not_found');
      return;
    }

    const subject = message.subject?.trim() || '(no subject)';
    const snippet = sanitizeSnippet(message.content);
    // Prefer job-level classification override (e.g. manual reclassification),
    // then fall back to stored message classification.
    const effectiveClassification = classification ?? message.classification ?? null;
    const bucket = normalizePrimaryClassification(effectiveClassification);

    const sender = message.fromName?.trim()
      ? message.fromAddress
        ? `${message.fromName.trim()} <${message.fromAddress}>`
        : message.fromName.trim()
      : (message.fromAddress ?? 'Unknown sender');

    const frontendBaseUrl = app.config?.CORS_ORIGIN ?? process.env.CORS_ORIGIN ?? 'http://localhost:3000';

    await sendInboxEmailNotification(app, {
      conversationId,
      classification: bucket,
      subject,
      sender,
      receivedAt: message.sentAt.toISOString(),
      snippet,
      inboxUrl: buildInboxConversationUrl(frontendBaseUrl, conversationId),
    });

    logger.info({ classification: bucket }, 'inbox_telegram_notify_completed');
  };
}
