import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';

interface Setting {
  key: string;
  value: unknown;
  updatedAt: string;
}

// Settings keys that are safe to expose to the assistant
const SAFE_KEYS = new Set([
  'business_name',
  'business_timezone',
  'email_signature',
  'caldav_enabled',
  'email_poll_interval',
  'ai_default_model',
]);

export function registerSettingsTools(api: OpenClawPluginApi, client: ApiClient): void {
  api.registerTool({
    name: 'get_settings',
    label: 'Application Settings',
    description:
      'Get application settings (non-sensitive). Shows business configuration like timezone, email settings, and enabled features.',
    parameters: Type.Object({}),
    async execute() {
      const data = await client.get<Setting[]>('/api/v1/settings');
      const settings = (data as unknown as Setting[])
        .filter(s => SAFE_KEYS.has(s.key))
        .reduce<Record<string, unknown>>((acc, s) => {
          acc[s.key] = s.value;
          return acc;
        }, {});
      return { content: [{ type: 'text' as const, text: JSON.stringify({ settings }, null, 2) }], details: {} };
    },
  });
}
