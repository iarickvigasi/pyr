/**
 * localStorage abstraction for assistant chat message persistence.
 *
 * Provides counter-based stable session keys (dashboard:1, dashboard:2, ...)
 * and per-session message storage with automatic pruning.
 */

const COUNTER_KEY = 'pyr_chat_counter';
const SESSION_KEY = 'pyr_assistant_session';
const MSG_PREFIX = 'pyr_chat_';
const MAX_MESSAGES_PER_SESSION = 500;
const MAX_SESSIONS_RETAINED = 3;
const STORAGE_VERSION = 1;

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO 8601
  toolCalls?: Array<{ name: string; status: 'complete' }>;
  toolCount?: number; // total tool count for collapsed summary
}

interface StoredSession {
  version: number;
  messages: StoredMessage[];
}

function isSSR(): boolean {
  return typeof window === 'undefined';
}

function storageKeyForSession(sessionKey: string): string {
  return `${MSG_PREFIX}${sessionKey}`;
}

/** Read the incrementing session counter from localStorage (defaults to 1). */
export function getCurrentSessionCounter(): number {
  if (isSSR()) return 1;
  const val = localStorage.getItem(COUNTER_KEY);
  return val ? parseInt(val, 10) : 1;
}

/** Return the current session key string (e.g. "dashboard:1"). */
export function getSessionKey(): string {
  return `dashboard:${getCurrentSessionCounter()}`;
}

/** Increment the session counter, prune old sessions, and return the new key. */
export function incrementSession(): string {
  if (isSSR()) return 'dashboard:1';
  const next = getCurrentSessionCounter() + 1;
  localStorage.setItem(COUNTER_KEY, String(next));
  const newKey = `dashboard:${next}`;
  localStorage.setItem(SESSION_KEY, newKey);
  pruneOldSessions(next);
  return newKey;
}

/** Load stored messages for a session. Returns empty array on missing/corrupt data. */
export function loadMessages(sessionKey: string): StoredMessage[] {
  if (isSSR()) return [];
  try {
    const raw = localStorage.getItem(storageKeyForSession(sessionKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredSession | StoredMessage[];

    // Handle versioned format
    if (!Array.isArray(parsed) && parsed.version === STORAGE_VERSION) {
      return Array.isArray(parsed.messages) ? parsed.messages : [];
    }

    // Handle legacy unversioned array (shouldn't happen but be safe)
    if (Array.isArray(parsed)) {
      return parsed;
    }

    return [];
  } catch {
    return [];
  }
}

/** Save messages to localStorage for a session. Trims to MAX_MESSAGES_PER_SESSION. */
export function saveMessages(sessionKey: string, messages: StoredMessage[]): void {
  if (isSSR()) return;
  const trimmed = messages.length > MAX_MESSAGES_PER_SESSION
    ? messages.slice(messages.length - MAX_MESSAGES_PER_SESSION)
    : messages;
  const session: StoredSession = {
    version: STORAGE_VERSION,
    messages: trimmed,
  };
  try {
    localStorage.setItem(storageKeyForSession(sessionKey), JSON.stringify(session));
  } catch {
    // localStorage full or unavailable -- silently fail
  }
}

/** Remove localStorage keys for sessions older than the retention window. */
function pruneOldSessions(currentCounter: number): void {
  if (isSSR()) return;
  const minKeep = currentCounter - (MAX_SESSIONS_RETAINED - 1);
  if (minKeep <= 0) return;
  for (let i = 1; i < minKeep; i++) {
    localStorage.removeItem(storageKeyForSession(`dashboard:${i}`));
  }
}

/**
 * Initialize the session key on first load.
 * Handles transition from old `dashboard:<timestamp>` format to counter-based.
 * Returns the current session key.
 */
export function initializeSessionKey(): string {
  if (isSSR()) return 'dashboard:1';

  const existingCounter = localStorage.getItem(COUNTER_KEY);
  const existingKey = localStorage.getItem(SESSION_KEY);

  // Already using counter-based keys
  if (existingCounter) {
    const counter = parseInt(existingCounter, 10);
    if (!isNaN(counter) && counter > 0) {
      const key = `dashboard:${counter}`;
      // Ensure SESSION_KEY is in sync
      localStorage.setItem(SESSION_KEY, key);
      return key;
    }
  }

  // Detect old timestamp-based format (e.g. "dashboard:1714000000000")
  if (existingKey && existingKey.startsWith('dashboard:')) {
    const suffix = existingKey.slice('dashboard:'.length);
    const num = parseInt(suffix, 10);
    // Old timestamp keys have 13+ digits; counter keys are small numbers
    if (!isNaN(num) && suffix.length >= 10) {
      // Transition: reset to counter-based
      localStorage.setItem(COUNTER_KEY, '1');
      localStorage.setItem(SESSION_KEY, 'dashboard:1');
      // Remove the old session's messages (different key format, won't collide)
      localStorage.removeItem(storageKeyForSession(existingKey));
      return 'dashboard:1';
    }
  }

  // First ever load -- no counter, no key
  localStorage.setItem(COUNTER_KEY, '1');
  localStorage.setItem(SESSION_KEY, 'dashboard:1');
  return 'dashboard:1';
}
