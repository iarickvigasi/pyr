import type { PrismaClient } from '@prisma/client';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { computeChanges, handleUniqueConstraint } from '../../lib/prisma-helpers.js';
import { NotFoundError } from '../../lib/errors.js';
import type {
  CreateRoomExternalMappingBody,
  ListRoomExternalMappingsQuery,
  UpdateRoomExternalMappingBody,
} from './room.schema.js';

export async function listRoomExternalMappings(
  prisma: PrismaClient,
  query: ListRoomExternalMappingsQuery,
) {
  return prisma.roomExternalMapping.findMany({
    where: {
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.roomId ? { roomId: query.roomId } : {}),
    },
    include: {
      room: {
        select: { id: true, name: true, roomTypeId: true },
      },
    },
    orderBy: [
      { provider: 'asc' },
      { externalAccommodationId: 'asc' },
    ],
  });
}

export async function createRoomExternalMapping(
  prisma: PrismaClient,
  data: CreateRoomExternalMappingBody,
  actorId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: data.roomId } });
    if (!room) throw new NotFoundError('Room', data.roomId);

    const created = await tx.roomExternalMapping.create({
      data: {
        roomId: data.roomId,
        provider: data.provider.trim().toLowerCase(),
        externalAccommodationId: data.externalAccommodationId.trim(),
        externalAccommodationTypeId: data.externalAccommodationTypeId ?? null,
        defaultAdults: data.defaultAdults ?? null,
        defaultChildren: data.defaultChildren ?? null,
      },
      include: {
        room: {
          select: { id: true, name: true, roomTypeId: true },
        },
      },
    }).catch((err: unknown) => {
      handleUniqueConstraint(err, 'RoomExternalMapping');
    });

    await writeAuditLog(tx, {
      entityType: 'room_external_mapping',
      entityId: created.id,
      action: 'create',
      changes: data as unknown as Record<string, unknown>,
      actor: getActor(actorId),
    });

    return created;
  });
}

export async function updateRoomExternalMapping(
  prisma: PrismaClient,
  id: string,
  data: UpdateRoomExternalMappingBody,
  actorId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.roomExternalMapping.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('RoomExternalMapping', id);

    if (data.roomId) {
      const room = await tx.room.findUnique({ where: { id: data.roomId } });
      if (!room) throw new NotFoundError('Room', data.roomId);
    }

    const updated = await tx.roomExternalMapping.update({
      where: { id },
      data: {
        ...(data.roomId !== undefined ? { roomId: data.roomId } : {}),
        ...(data.provider !== undefined ? { provider: data.provider.trim().toLowerCase() } : {}),
        ...(data.externalAccommodationId !== undefined ? { externalAccommodationId: data.externalAccommodationId.trim() } : {}),
        ...(data.externalAccommodationTypeId !== undefined ? { externalAccommodationTypeId: data.externalAccommodationTypeId ?? null } : {}),
        ...(data.defaultAdults !== undefined ? { defaultAdults: data.defaultAdults ?? null } : {}),
        ...(data.defaultChildren !== undefined ? { defaultChildren: data.defaultChildren ?? null } : {}),
      },
      include: {
        room: {
          select: { id: true, name: true, roomTypeId: true },
        },
      },
    }).catch((err: unknown) => {
      handleUniqueConstraint(err, 'RoomExternalMapping');
    });

    const changes = computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );
    if (changes) {
      await writeAuditLog(tx, {
        entityType: 'room_external_mapping',
        entityId: id,
        action: 'update',
        changes,
        actor: getActor(actorId),
      });
    }

    return updated;
  });
}

export async function deleteRoomExternalMapping(
  prisma: PrismaClient,
  id: string,
  actorId?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.roomExternalMapping.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('RoomExternalMapping', id);

    await tx.roomExternalMapping.delete({ where: { id } });

    await writeAuditLog(tx, {
      entityType: 'room_external_mapping',
      entityId: id,
      action: 'delete',
      actor: getActor(actorId),
    });
  });
}
