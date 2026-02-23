import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  settingKeyParamSchema,
  upsertSettingBodySchema,
  upsertSettingByKeyBodySchema,
  settingResponseSchema,
  settingsListResponseSchema,
  testEmailConnectionBodySchema,
  testEmailConnectionResponseSchema,
  emailProviderConfigBodySchema,
  togglePollingBodySchema,
} from './settings.schema.js';
import {
  listSettings,
  getSetting,
  upsertSetting,
  getEmailProviderConfig,
  saveEmailProviderConfig,
  toggleEmailPolling,
} from './settings.service.js';
import { getActor } from '../../lib/audit.js';
import { errorResponseSchema } from '../../lib/error-response.schema.js';

export default async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.addHook('onRequest', app.authenticate);

  server.get('/', {
    schema: {
      tags: ['Settings'],
      summary: 'List all settings',
      response: { 200: settingsListResponseSchema },
    },
  }, async () => {
    const settings = await listSettings(app.prisma);
    return { data: settings };
  });

  server.get('/:key', {
    schema: {
      tags: ['Settings'],
      summary: 'Get a single setting by key',
      params: settingKeyParamSchema,
      response: { 200: settingResponseSchema, 404: errorResponseSchema },
    },
  }, async (request) => {
    const { key } = request.params as { key: string };
    const setting = await getSetting(app.prisma, key);
    return { data: setting };
  });

  server.post('/', {
    schema: {
      tags: ['Settings'],
      summary: 'Create or update a setting (key in body)',
      body: upsertSettingByKeyBodySchema,
      response: { 200: settingResponseSchema, 400: errorResponseSchema },
    },
  }, async (request) => {
    const { key, value } = request.body as { key: string; value: unknown };
    const setting = await upsertSetting(app.prisma, key, value, request.user?.sub);
    return { data: setting };
  });

  server.put('/:key', {
    schema: {
      tags: ['Settings'],
      summary: 'Create or update a setting',
      params: settingKeyParamSchema,
      body: upsertSettingBodySchema,
      response: { 200: settingResponseSchema, 400: errorResponseSchema },
    },
  }, async (request) => {
    const { key } = request.params as { key: string };
    const { value } = request.body as { value: unknown };
    const setting = await upsertSetting(
      app.prisma,
      key,
      value,
      request.user?.sub,
    );
    return { data: setting };
  });

  // ─── Email Provider Config Routes ──────────────────────────

  server.post('/test-email-connection', {
    schema: {
      tags: ['Settings'],
      summary: 'Test IMAP and SMTP email connection',
      body: testEmailConnectionBodySchema,
      response: { 200: testEmailConnectionResponseSchema, 400: errorResponseSchema },
    },
  }, async (request) => {
    const body = request.body as {
      provider: string;
      imapHost: string;
      imapPort: number;
      smtpHost: string;
      smtpPort: number;
      email: string;
      password: string;
    };

    let imapOk = false;
    let smtpOk = false;
    let error: string | undefined;

    // Test IMAP connection
    try {
      const { ImapFlow } = await import('imapflow');
      const client = new ImapFlow({
        host: body.imapHost,
        port: body.imapPort,
        secure: true,
        auth: { user: body.email, pass: body.password },
        logger: false,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
      });
      await client.connect();
      await client.logout();
      imapOk = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'IMAP connection failed';
      error = `IMAP: ${message}`;
      app.log.warn({ err }, 'Email connection test: IMAP failed');
    }

    // Test SMTP connection
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({
        host: body.smtpHost,
        port: body.smtpPort,
        secure: false,
        auth: { user: body.email, pass: body.password },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
      });
      await transporter.verify();
      smtpOk = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SMTP connection failed';
      const smtpError = `SMTP: ${message}`;
      error = error ? `${error}; ${smtpError}` : smtpError;
      app.log.warn({ err }, 'Email connection test: SMTP failed');
    }

    return { data: { imap: imapOk, smtp: smtpOk, error } };
  });

  server.post('/email-provider', {
    schema: {
      tags: ['Settings'],
      summary: 'Save email provider configuration',
      body: emailProviderConfigBodySchema,
    },
  }, async (request) => {
    const body = request.body as {
      provider: 'gmx' | 'gmail' | 'outlook' | 'custom';
      imapHost: string;
      imapPort: number;
      smtpHost: string;
      smtpPort: number;
      email: string;
      password: string;
      pollIntervalMinutes: number;
      pollingEnabled: boolean;
    };

    const actor = getActor(request.user?.sub);

    await saveEmailProviderConfig(app.prisma, body, actor);

    // Restart polling with new config if polling is enabled
    if (body.pollingEnabled) {
      try {
        // Update poll interval in settings for the email module to pick up
        const intervalMs = body.pollIntervalMinutes * 60 * 1000;
        await upsertSetting(app.prisma, 'email_poll_interval_ms', intervalMs, request.user?.sub);
      } catch (err) {
        app.log.warn({ err }, 'Failed to update poll interval setting');
      }
    }

    return { data: { saved: true } };
  });

  server.get('/email-provider', {
    schema: {
      tags: ['Settings'],
      summary: 'Get email provider configuration (password masked)',
    },
  }, async () => {
    const config = await getEmailProviderConfig(app.prisma);
    if (!config) {
      return {
        data: {
          configured: false,
          provider: null,
          imapHost: null,
          imapPort: null,
          smtpHost: null,
          smtpPort: null,
          email: null,
          password: '',
          pollIntervalMinutes: 2,
          pollingEnabled: true,
          lastPollTime: null,
          connectionHealthy: null,
        },
      };
    }

    // Fetch last poll time
    let lastPollTime: string | null = null;
    try {
      const lastUidSetting = await getSetting(app.prisma, 'imap_last_uid');
      if (lastUidSetting.value !== null) {
        // We don't store poll time directly, but having a last_uid means polling has run
        lastPollTime = 'active';
      }
    } catch {
      // No last UID -- polling hasn't run yet
    }

    return {
      data: {
        configured: true,
        provider: config.provider,
        imapHost: config.imapHost,
        imapPort: config.imapPort,
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
        email: config.email,
        password: '', // Never return password
        pollIntervalMinutes: config.pollIntervalMinutes,
        pollingEnabled: config.pollingEnabled,
        lastPollTime,
        connectionHealthy: null, // Will be set by health check
      },
    };
  });

  server.post('/email-provider/toggle-polling', {
    schema: {
      tags: ['Settings'],
      summary: 'Toggle email polling on/off',
      body: togglePollingBodySchema,
    },
  }, async (request) => {
    const { enabled } = request.body as { enabled: boolean };
    const actor = getActor(request.user?.sub);

    await toggleEmailPolling(app.prisma, enabled, actor);

    return { data: { pollingEnabled: enabled } };
  });
}
