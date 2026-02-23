import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { createApiClient } from './lib/api-client.js';
import { registerGuestTools } from './tools/guests.js';
import { registerBookingTools } from './tools/bookings.js';
import { registerRoomTools } from './tools/rooms.js';
import { registerEventTools } from './tools/events.js';
import { registerConversationTools } from './tools/conversations.js';
import { registerDashboardTools } from './tools/dashboard.js';
import { registerSettingsTools } from './tools/settings.js';
import { registerActionTools } from './tools/actions.js';
import { registerDraftTools } from './tools/drafts.js';

export default {
  id: 'pyr-assistant',
  name: 'PYR Business Assistant',

  register(api: OpenClawPluginApi): void {
    const pluginCfg = (api.pluginConfig ?? {}) as Record<string, string | undefined>;
    const apiUrl = pluginCfg['apiUrl'] ?? process.env['PYR_API_URL'] ?? 'http://host.docker.internal:3001';
    const apiKey = pluginCfg['apiKey'] ?? process.env['PYR_API_KEY'] ?? '';

    if (!apiKey) {
      api.logger.warn('PYR Assistant plugin: No API key configured. Tools will fail to authenticate.');
    }

    const client = createApiClient(apiUrl, apiKey);

    registerGuestTools(api, client);
    registerBookingTools(api, client);
    registerRoomTools(api, client);
    registerEventTools(api, client);
    registerConversationTools(api, client);
    registerDashboardTools(api, client);
    registerSettingsTools(api, client);
    registerActionTools(api, client);
    registerDraftTools(api, client);

    api.logger.info('PYR Assistant plugin loaded: 37 tools registered (17 read + 16 action + 4 draft)');
  },
};
