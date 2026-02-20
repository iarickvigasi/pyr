import type { PrismaClient, Prisma } from '@prisma/client';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { NotFoundError } from '../../lib/errors.js';
import { encrypt, decrypt } from '../../lib/encryption.js';

export interface SettingRecord {
  key: string;
  value: unknown;
}

export interface EmailProviderConfig {
  provider: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  email: string;
  password: string;
  pollIntervalMinutes: number;
  pollingEnabled: boolean;
}

export async function listSettings(
  prisma: PrismaClient,
): Promise<SettingRecord[]> {
  const settings = await prisma.setting.findMany({
    orderBy: { key: 'asc' },
  });
  return settings.map((s) => ({ key: s.key, value: s.value }));
}

export async function getSetting(
  prisma: PrismaClient,
  key: string,
): Promise<SettingRecord> {
  const setting = await prisma.setting.findUnique({ where: { key } });
  if (!setting) throw new NotFoundError(`Setting '${key}' not found`);
  return { key: setting.key, value: setting.value };
}

export async function upsertSetting(
  prisma: PrismaClient,
  key: string,
  value: unknown,
  userId?: string,
): Promise<SettingRecord> {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.setting.findUnique({ where: { key } });
    const action = existing ? 'update' : 'create';

    const setting = await tx.setting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });

    await writeAuditLog(tx, {
      entityType: 'setting',
      entityId: setting.id,
      action,
      changes: { key, value } as Record<string, unknown>,
      actor: getActor(userId),
    });

    return setting;
  });

  return { key: result.key, value: result.value };
}

// ─── Email Provider Config Helpers ──────────────────────────

const EMAIL_PROVIDER_CONFIG_KEY = 'email_provider_config';

/**
 * Read the email provider configuration from the settings table.
 * Decrypts the password field before returning.
 * Returns null if no config is stored.
 */
export async function getEmailProviderConfig(
  prisma: PrismaClient,
): Promise<EmailProviderConfig | null> {
  const setting = await prisma.setting.findUnique({
    where: { key: EMAIL_PROVIDER_CONFIG_KEY },
  });
  if (!setting) return null;

  const config = setting.value as Record<string, unknown>;
  if (!config || typeof config !== 'object') return null;

  try {
    const decryptedPassword = decrypt(config.encryptedPassword as string);
    return {
      provider: config.provider as string,
      imapHost: config.imapHost as string,
      imapPort: config.imapPort as number,
      smtpHost: config.smtpHost as string,
      smtpPort: config.smtpPort as number,
      email: config.email as string,
      password: decryptedPassword,
      pollIntervalMinutes: (config.pollIntervalMinutes as number) ?? 2,
      pollingEnabled: (config.pollingEnabled as boolean) ?? true,
    };
  } catch {
    // Decryption failed -- config is corrupt or key changed
    return null;
  }
}

/**
 * Save the email provider configuration to the settings table.
 * Encrypts the password before storing. Writes audit log (password masked).
 */
export async function saveEmailProviderConfig(
  prisma: PrismaClient,
  config: EmailProviderConfig,
  actor: string,
): Promise<void> {
  const encryptedPassword = encrypt(config.password);

  const storedValue = {
    provider: config.provider,
    imapHost: config.imapHost,
    imapPort: config.imapPort,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    email: config.email,
    encryptedPassword,
    pollIntervalMinutes: config.pollIntervalMinutes,
    pollingEnabled: config.pollingEnabled,
  };

  await prisma.$transaction(async (tx) => {
    const existing = await tx.setting.findUnique({
      where: { key: EMAIL_PROVIDER_CONFIG_KEY },
    });
    const action = existing ? 'update' : 'create';

    await tx.setting.upsert({
      where: { key: EMAIL_PROVIDER_CONFIG_KEY },
      create: {
        key: EMAIL_PROVIDER_CONFIG_KEY,
        value: storedValue as unknown as Prisma.InputJsonValue,
      },
      update: {
        value: storedValue as unknown as Prisma.InputJsonValue,
      },
    });

    // Audit log with password masked
    await writeAuditLog(tx, {
      entityType: 'setting',
      entityId: EMAIL_PROVIDER_CONFIG_KEY,
      action,
      changes: {
        provider: config.provider,
        email: config.email,
        imapHost: config.imapHost,
        smtpHost: config.smtpHost,
        pollIntervalMinutes: config.pollIntervalMinutes,
        pollingEnabled: config.pollingEnabled,
        password: '***REDACTED***',
      },
      actor,
    });
  });
}

/**
 * Update only the pollingEnabled flag in the email provider config.
 */
export async function toggleEmailPolling(
  prisma: PrismaClient,
  enabled: boolean,
  actor: string,
): Promise<void> {
  const setting = await prisma.setting.findUnique({
    where: { key: EMAIL_PROVIDER_CONFIG_KEY },
  });
  if (!setting) {
    throw new NotFoundError('Email provider config not configured');
  }

  const config = setting.value as Record<string, unknown>;
  config.pollingEnabled = enabled;

  await prisma.$transaction(async (tx) => {
    await tx.setting.update({
      where: { key: EMAIL_PROVIDER_CONFIG_KEY },
      data: { value: config as Prisma.InputJsonValue },
    });

    await writeAuditLog(tx, {
      entityType: 'setting',
      entityId: EMAIL_PROVIDER_CONFIG_KEY,
      action: 'update',
      changes: { pollingEnabled: enabled },
      actor,
    });
  });
}
