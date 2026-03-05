import { describe, expect, it } from 'vitest';
import {
  ConfirmationGuard,
  extractActionIdFromToolResult,
  extractUserTextFromMessage,
  isExplicitConfirmation,
} from '../lib/confirmation-guard.js';

describe('confirmation guard', () => {
  it('blocks same-turn auto-confirm and allows explicit follow-up confirm', () => {
    const guard = new ConfirmationGuard();
    const sessionKey = 'agent:main:telegram:direct:130414078';

    guard.noteUserMessage(sessionKey, 'send the draft');
    guard.noteToolResult(sessionKey, 'approve_draft', {
      content: [{ type: 'text', text: '{"actionId":"action-1","message":"ready"}' }],
    });

    const sameTurn = guard.canConfirm(sessionKey, 'action-1');
    expect(sameTurn.ok).toBe(false);

    guard.noteUserMessage(sessionKey, 'ok');
    const followUp = guard.canConfirm(sessionKey, 'action-1');
    expect(followUp.ok).toBe(true);
  });

  it('requires explicit confirmation wording in follow-up message', () => {
    const guard = new ConfirmationGuard();
    const sessionKey = 'agent:main:telegram:direct:130414078';

    guard.noteUserMessage(sessionKey, 'please send');
    guard.noteToolResult(sessionKey, 'approve_draft', {
      content: [{ type: 'text', text: '{"actionId":"action-2"}' }],
    });

    guard.noteUserMessage(sessionKey, 'show it');
    const check = guard.canConfirm(sessionKey, 'action-2');
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/not an explicit confirmation/i);
  });

  it('blocks cross-session confirmation attempts', () => {
    const guard = new ConfirmationGuard();
    const ownerSession = 'agent:main:telegram:direct:130414078';
    const anotherSession = 'agent:main:telegram:direct:999999';

    guard.noteUserMessage(ownerSession, 'prepare send');
    guard.noteToolResult(ownerSession, 'approve_draft', {
      content: [{ type: 'text', text: '{"actionId":"action-3"}' }],
    });
    guard.noteUserMessage(anotherSession, 'ok');

    const check = guard.canConfirm(anotherSession, 'action-3');
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/different session/i);
  });
});

describe('confirmation helpers', () => {
  it('extracts actionId from tool result JSON text payload', () => {
    const actionId = extractActionIdFromToolResult({
      content: [{ type: 'text', text: '{"actionId":"abc-123"}' }],
    });
    expect(actionId).toBe('abc-123');
  });

  it('extracts user text from message payload and detects explicit confirmation', () => {
    const text = extractUserTextFromMessage({
      role: 'user',
      content: [{ type: 'text', text: 'metadata\n\nok try again' }],
    });
    expect(text).toBe('metadata\n\nok try again');
    expect(isExplicitConfirmation(text ?? '')).toBe(true);
  });
});
