import type { PrismaClient, Prisma } from '@prisma/client';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { NotFoundError } from '../../lib/errors.js';

export interface SettingRecord {
  key: string;
  value: unknown;
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
