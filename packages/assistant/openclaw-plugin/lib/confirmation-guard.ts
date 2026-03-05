type ConfirmationActionMeta = {
  sessionKey: string;
  preparedAtUserSequence: number;
  createdAt: number;
};

type ConfirmationCheckResult = {
  ok: boolean;
  reason?: string;
};

const ACTION_META_TTL_MS = 60 * 60 * 1000; // 1 hour

const EXPLICIT_CONFIRM_RE =
  /^(ok|okay|yes|confirm|confirmed|approve|approved|go ahead|proceed|send|send it|send now|retry|try again)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseActionIdFromText(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.actionId === 'string' && parsed.actionId.trim().length > 0) {
      return parsed.actionId.trim();
    }
  } catch {
    // Non-JSON text; fall through to regex.
  }

  const match = text.match(/"actionId"\s*:\s*"([^"]+)"/);
  if (match && match[1]) return match[1];
  return null;
}

export function extractActionIdFromToolResult(result: unknown): string | null {
  if (!isRecord(result)) return null;

  if (typeof result.actionId === 'string' && result.actionId.trim().length > 0) {
    return result.actionId.trim();
  }

  const content = result.content;
  if (!Array.isArray(content)) return null;

  for (const part of content) {
    if (!isRecord(part) || typeof part.text !== 'string') continue;
    const actionId = parseActionIdFromText(part.text);
    if (actionId) return actionId;
  }

  return null;
}

function extractLastUserLine(text: string): string {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== '```');
  return lines.at(-1) ?? '';
}

export function isExplicitConfirmation(text: string): boolean {
  const lastLine = extractLastUserLine(text);
  return EXPLICIT_CONFIRM_RE.test(lastLine);
}

export function extractUserTextFromMessage(message: unknown): string | null {
  if (!isRecord(message)) return null;
  if (message.role !== 'user') return null;

  const content = message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  for (const part of content) {
    if (!isRecord(part) || typeof part.text !== 'string') continue;
    if (part.text.trim().length === 0) continue;
    parts.push(part.text);
  }

  if (parts.length === 0) return null;
  return parts.join('\n');
}

export class ConfirmationGuard {
  private userSequenceBySession = new Map<string, number>();
  private lastUserTextBySession = new Map<string, string>();
  private actionMetaById = new Map<string, ConfirmationActionMeta>();

  noteUserMessage(sessionKey: string, text: string): void {
    if (!sessionKey) return;
    this.cleanupExpired();
    const nextSequence = (this.userSequenceBySession.get(sessionKey) ?? 0) + 1;
    this.userSequenceBySession.set(sessionKey, nextSequence);
    this.lastUserTextBySession.set(sessionKey, text);
  }

  noteToolResult(sessionKey: string, toolName: string, result: unknown): void {
    if (!sessionKey) return;
    this.cleanupExpired();

    if (toolName === 'confirm_action' || toolName === 'cancel_action') return;

    const actionId = extractActionIdFromToolResult(result);
    if (!actionId) return;

    const currentUserSequence = this.userSequenceBySession.get(sessionKey) ?? 0;
    this.actionMetaById.set(actionId, {
      sessionKey,
      preparedAtUserSequence: currentUserSequence,
      createdAt: Date.now(),
    });
  }

  consumeAction(actionId: string): void {
    this.actionMetaById.delete(actionId);
  }

  canConfirm(sessionKey: string, actionId: string): ConfirmationCheckResult {
    this.cleanupExpired();
    const meta = this.actionMetaById.get(actionId);
    if (!meta) return { ok: true };

    if (meta.sessionKey !== sessionKey) {
      return {
        ok: false,
        reason: 'This action was prepared in a different session. Please prepare it again here.',
      };
    }

    const currentUserSequence = this.userSequenceBySession.get(sessionKey) ?? 0;
    if (currentUserSequence <= meta.preparedAtUserSequence) {
      return {
        ok: false,
        reason:
          'Confirmation blocked: please send a separate confirmation message now (for example: "OK").',
      };
    }

    const lastUserText = this.lastUserTextBySession.get(sessionKey) ?? '';
    if (!isExplicitConfirmation(lastUserText)) {
      return {
        ok: false,
        reason:
          'Confirmation blocked: your latest message is not an explicit confirmation. Reply with "OK" to proceed.',
      };
    }

    return { ok: true };
  }

  private cleanupExpired(): void {
    const cutoff = Date.now() - ACTION_META_TTL_MS;
    for (const [actionId, meta] of this.actionMetaById.entries()) {
      if (meta.createdAt < cutoff) this.actionMetaById.delete(actionId);
    }
  }
}
