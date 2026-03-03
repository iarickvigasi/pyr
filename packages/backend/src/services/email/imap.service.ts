import { ImapFlow } from 'imapflow';
import type { Logger } from 'pino';

// ─── Types ──────────────────────────────────────────────────

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure?: boolean; // default true
}

export interface RawEmail {
  uid: number;
  source: Buffer;
}

// ─── Constants ──────────────────────────────────────────────

const MAX_FETCH_PER_POLL = 100;
const CONNECTION_TIMEOUT_MS = 30_000;
const GREETING_TIMEOUT_MS = 16_000;
const SOCKET_TIMEOUT_MS = 120_000;

// ─── Factory ────────────────────────────────────────────────

export function createImapService(logger: Logger) {
  /**
   * Poll for new emails via IMAP.
   *
   * Uses a connect-per-poll strategy: a fresh ImapFlow client is created for
   * each poll cycle, connects, fetches, then disconnects. This avoids long-lived
   * IMAP connections that can go stale with certain providers (GMX, etc.).
   *
   * @param config  IMAP server connection parameters
   * @param lastUid If provided, fetches messages with UID > lastUid.
   *                If omitted, fetches all unseen messages.
   * @returns Array of raw email objects (uid + MIME source buffer)
   */
  async function pollNewEmails(
    config: ImapConfig,
    lastUid?: number,
    minDate?: Date,
  ): Promise<RawEmail[]> {
    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure ?? true,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      logger: false,
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: GREETING_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
    });

    logger.info(
      { host: config.host, port: config.port, lastUid, minDate: minDate?.toISOString() },
      'IMAP poll starting',
    );

    try {
      await client.connect();

      let lock;
      try {
        lock = await client.getMailboxLock('INBOX');

        // Build the search query.
        // - Incremental mode: UID > lastUid
        // - First run mode: only unseen
        // - Optional minDate: discard older messages at IMAP search level
        const searchQuery = lastUid !== undefined
          ? {
              uid: `${lastUid + 1}:*` as const,
              ...(minDate ? { since: minDate } : {}),
            }
          : {
              seen: false,
              ...(minDate ? { since: minDate } : {}),
            };

        const uids = await client.search(searchQuery, { uid: true });

        if (!uids || uids.length === 0) {
          logger.info('IMAP poll complete: no new messages');
          return [];
        }

        // Filter out UIDs <= lastUid (IMAP `N:*` search quirk: always returns
        // at least UID N even when no new messages exist)
        const filteredUids = lastUid !== undefined
          ? uids.filter((uid) => uid > lastUid)
          : uids;

        if (filteredUids.length === 0) {
          logger.info('IMAP poll complete: no new messages (after UID filter)');
          return [];
        }

        // Cap at MAX_FETCH_PER_POLL to prevent memory issues on first run
        // with large inbox. Oldest messages first so we process chronologically.
        const uidsToFetch = filteredUids.slice(0, MAX_FETCH_PER_POLL);

        logger.info(
          { totalNew: filteredUids.length, fetching: uidsToFetch.length },
          'IMAP found new messages',
        );

        const results: RawEmail[] = [];

        for (const uid of uidsToFetch) {
          try {
            const message = await client.fetchOne(
              String(uid),
              { source: true, uid: true },
              { uid: true },
            );

            if (message && message.source) {
              results.push({
                uid: message.uid,
                source: message.source,
              });
            } else {
              logger.warn({ uid }, 'IMAP fetch returned no source for UID');
            }
          } catch (fetchError) {
            logger.error(
              { uid, error: fetchError },
              'IMAP failed to fetch message',
            );
            // Continue processing remaining messages
          }
        }

        logger.info(
          { fetched: results.length, total: filteredUids.length },
          'IMAP poll complete',
        );

        return results;
      } finally {
        if (lock) {
          lock.release();
        }
      }
    } finally {
      try {
        await client.logout();
      } catch {
        // Ignore logout errors — connection may already be closed
      }
    }
  }

  return { pollNewEmails };
}
