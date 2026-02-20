import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { Logger } from 'pino';

// ─── Types ──────────────────────────────────────────────────

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure?: boolean; // default false (STARTTLS)
}

export interface SendReplyParams {
  to: string;
  subject: string;
  html: string;
  inReplyTo?: string;     // Message-ID of the email being replied to
  references?: string[];  // Full chain of Message-IDs for threading
}

// ─── Constants ──────────────────────────────────────────────

const MAX_REFERENCES = 20;

// ─── Factory ────────────────────────────────────────────────

export function createSmtpService(config: SmtpConfig, logger: Logger) {
  const transporter: Transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? false,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const fromAddress = `"Puppy Yoga Retreat" <${config.user}>`;

  /**
   * Auto-prefix subject with "Re: " if it doesn't already start with it.
   */
  function ensureRePrefix(subject: string): string {
    if (/^re:\s/i.test(subject)) {
      return subject;
    }
    return `Re: ${subject}`;
  }

  /**
   * Cap references array to the most recent MAX_REFERENCES Message-IDs.
   * Returns a space-separated string for the References header.
   */
  function buildReferencesHeader(references: string[]): string {
    const capped = references.slice(-MAX_REFERENCES);
    return capped.join(' ');
  }

  /**
   * Append signature to HTML body.
   */
  function appendSignature(html: string, signature: string): string {
    return `${html}<br/><br/>--<br/>${signature}`;
  }

  /**
   * Send a reply email with threading headers preserved.
   * Returns the generated Message-ID for future threading.
   */
  async function sendReply(
    params: SendReplyParams,
    signature: string,
  ): Promise<string> {
    const reSubject = ensureRePrefix(params.subject);
    const htmlWithSignature = appendSignature(params.html, signature);

    const mailOptions: nodemailer.SendMailOptions = {
      from: fromAddress,
      replyTo: config.user,
      to: params.to,
      subject: reSubject,
      html: htmlWithSignature,
    };

    if (params.inReplyTo) {
      mailOptions.inReplyTo = params.inReplyTo;
    }

    if (params.references && params.references.length > 0) {
      mailOptions.references = buildReferencesHeader(params.references);
    }

    try {
      const info = await transporter.sendMail(mailOptions);

      logger.info(
        { to: params.to, subject: reSubject, messageId: info.messageId },
        'SMTP reply sent',
      );

      return info.messageId;
    } catch (err) {
      logger.error(
        { err, to: params.to, subject: reSubject },
        'SMTP reply failed',
      );
      throw err;
    }
  }

  /**
   * Send a new email (not a reply, no threading headers).
   * Returns the generated Message-ID.
   */
  async function sendNew(
    params: { to: string; subject: string; html: string },
    signature: string,
  ): Promise<string> {
    const htmlWithSignature = appendSignature(params.html, signature);

    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        replyTo: config.user,
        to: params.to,
        subject: params.subject,
        html: htmlWithSignature,
      });

      logger.info(
        { to: params.to, subject: params.subject, messageId: info.messageId },
        'SMTP new email sent',
      );

      return info.messageId;
    } catch (err) {
      logger.error(
        { err, to: params.to, subject: params.subject },
        'SMTP new email failed',
      );
      throw err;
    }
  }

  /**
   * Verify SMTP connection is working.
   */
  async function verifyConnection(): Promise<boolean> {
    try {
      await transporter.verify();
      return true;
    } catch (err) {
      logger.error({ err }, 'SMTP connection verification failed');
      return false;
    }
  }

  return { sendReply, sendNew, verifyConnection };
}
