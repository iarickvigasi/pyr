import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { createApiClient } from './lib/api-client.js';
import { ConfirmationGuard, extractUserTextFromMessage } from './lib/confirmation-guard.js';
import { registerGuestTools } from './tools/guests.js';
import { registerBookingTools } from './tools/bookings.js';
import { registerRoomTools } from './tools/rooms.js';
import { registerEventTools } from './tools/events.js';
import { registerConversationTools } from './tools/conversations.js';
import { registerDashboardTools } from './tools/dashboard.js';
import { registerSettingsTools } from './tools/settings.js';
import { registerActionTools } from './tools/actions.js';
import { registerDraftTools } from './tools/drafts.js';
import { registerPaymentTools } from './tools/payments.js';

export default {
  id: 'pyr-assistant',
  name: 'PYR Business Assistant',

  register(api: OpenClawPluginApi): void {
    const pluginCfg = (api.pluginConfig ?? {}) as Record<string, string | undefined>;
    const apiUrl = pluginCfg['apiUrl'] ?? process.env['PYR_API_URL'] ?? 'http://localhost:3001';
    const apiKey = pluginCfg['apiKey'] ?? process.env['PYR_API_KEY'] ?? '';

    if (!apiKey) {
      api.logger.warn('PYR Assistant plugin: No API key configured. Tools will fail to authenticate.');
    }

    const client = createApiClient(apiUrl, apiKey);
    const confirmationGuard = new ConfirmationGuard();

    api.on('before_message_write', (event, ctx) => {
      const sessionKey = ctx.sessionKey;
      if (!sessionKey) return;

      const userText = extractUserTextFromMessage(event.message);
      if (!userText) return;

      confirmationGuard.noteUserMessage(sessionKey, userText);
    });

    api.on('after_tool_call', (event, ctx) => {
      const sessionKey = ctx.sessionKey;
      if (!sessionKey) return;

      const actionId = typeof event.params?.actionId === 'string' ? event.params.actionId : null;
      if ((event.toolName === 'confirm_action' || event.toolName === 'cancel_action') && actionId) {
        confirmationGuard.consumeAction(actionId);
      }

      confirmationGuard.noteToolResult(sessionKey, event.toolName, event.result);
    });

    api.on('before_tool_call', (event, ctx) => {
      if (event.toolName !== 'confirm_action') return;

      const sessionKey = ctx.sessionKey;
      const actionId = typeof event.params?.actionId === 'string' ? event.params.actionId.trim() : '';
      if (!sessionKey || !actionId) return;

      const gate = confirmationGuard.canConfirm(sessionKey, actionId);
      if (!gate.ok) {
        return {
          block: true,
          blockReason: gate.reason,
        };
      }
    });

    registerGuestTools(api, client);
    registerBookingTools(api, client);
    registerRoomTools(api, client);
    registerEventTools(api, client);
    registerConversationTools(api, client);
    registerDashboardTools(api, client);
    registerSettingsTools(api, client);
    registerActionTools(api, client);
    registerDraftTools(api, client);
    registerPaymentTools(api, client);

    api.logger.info('PYR Assistant plugin loaded: 44 tools registered (19 read + 19 action + 6 draft)');
  },
};
