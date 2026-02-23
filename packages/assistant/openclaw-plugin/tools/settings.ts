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
    parameters: { type: 'object' as const, properties: {}, required: [] },
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

  // ── 2. Update Setting (Direct Execution) ──────────────

  // Keys that can be updated via the assistant (non-sensitive)
  const WRITABLE_KEYS = new Set([
    'business_name',
    'business_timezone',
    'email_signature',
    'email_poll_interval',
    'ai_default_model',
    'morning_briefing_time',
  ]);

  api.registerTool({
    name: 'update_setting',
    label: 'Update Setting',
    description:
      'Update a non-sensitive application setting. Only safe settings can be modified: business_name, business_timezone, email_signature, email_poll_interval, ai_default_model, morning_briefing_time.',
    parameters: {
      type: 'object' as const,
      properties: {
        key: { type: 'string', description: 'Setting key to update' },
        value: { type: 'string', description: 'New value for the setting' },
      },
      required: ['key', 'value'],
    },
    async execute(_id: string, params: { key: string; value: unknown }) {
      if (!WRITABLE_KEYS.has(params.key)) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: `Setting "${params.key}" cannot be updated via the assistant. Only these settings are allowed: ${[...WRITABLE_KEYS].join(', ')}.`,
            }, null, 2),
          }],
          details: {},
        };
      }

      await client.post('/api/v1/settings', { key: params.key, value: params.value });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            message: `Setting "${params.key}" updated successfully.`,
            setting: { key: params.key, value: params.value },
          }, null, 2),
        }],
        details: {},
      };
    },
  });
}
