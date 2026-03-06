import type { Prisma, PrismaClient } from '@prisma/client';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { ConflictError } from '../../lib/errors.js';
import type { PrismaClientOrTx } from '../../types/prisma.js';
import {
  createMotopressClientFromEnv,
  type MotopressAccommodation,
  type MotopressAccommodationType,
  type MotopressEnv,
} from '../../services/motopress/index.js';

const MOTOPRESS_PROVIDER = 'motopress';
const MOTOPRESS_PAGE_SIZE = 100;
const IMPORTED_ROOM_TYPE_BASE_PRICE = 100;

export interface ImportMotopressRoomsResult {
  total: {
    externalRoomTypes: number;
    externalRooms: number;
  };
  skipped: {
    roomTypes: number;
    rooms: number;
  };
  roomTypes: {
    created: number;
    updated: number;
  };
  rooms: {
    created: number;
    updated: number;
  };
  mappings: {
    created: number;
    updated: number;
  };
}

export async function importRoomsFromMotopress(
  prisma: PrismaClient,
  config: MotopressEnv,
  actorId?: string,
): Promise<ImportMotopressRoomsResult> {
  const client = createMotopressClientFromEnv(config);

  const [externalRoomTypes, externalRooms] = await Promise.all([
    listAllMotopressAccommodationTypes(client),
    listAllMotopressAccommodations(client),
  ]);

  const activeRoomTypes = externalRoomTypes.filter((item) => item.status === 'publish');
  const activeRooms = externalRooms.filter((item) => item.status === 'publish');

  const result: ImportMotopressRoomsResult = {
    total: {
      externalRoomTypes: externalRoomTypes.length,
      externalRooms: externalRooms.length,
    },
    skipped: {
      roomTypes: externalRoomTypes.length - activeRoomTypes.length,
      rooms: externalRooms.length - activeRooms.length,
    },
    roomTypes: { created: 0, updated: 0 },
    rooms: { created: 0, updated: 0 },
    mappings: { created: 0, updated: 0 },
  };

  await prisma.$transaction(async (tx) => {
    const existingMappings = await tx.roomExternalMapping.findMany({
      where: { provider: MOTOPRESS_PROVIDER },
      include: {
        room: {
          select: {
            id: true,
            name: true,
            roomTypeId: true,
            status: true,
          },
        },
      },
    });

    const mappingByAccommodationId = new Map(
      existingMappings.map((mapping) => [mapping.externalAccommodationId, mapping] as const),
    );

    const roomTypeIdByExternalTypeId = new Map<string, string>();
    for (const mapping of existingMappings) {
      if (mapping.externalAccommodationTypeId) {
        roomTypeIdByExternalTypeId.set(mapping.externalAccommodationTypeId, mapping.room.roomTypeId);
      }
    }

    for (const extType of activeRoomTypes) {
      const externalTypeId = String(extType.id);
      const desiredName = normalizeName(extType.title, `MotoPress Type ${extType.id}`);
      const desiredDescription = normalizeOptionalText(extType.description ?? extType.excerpt ?? null);
      const desiredMaxOccupancy = deriveMaxOccupancy(extType);

      const linkedRoomTypeId = roomTypeIdByExternalTypeId.get(externalTypeId);
      let roomType = linkedRoomTypeId
        ? await tx.roomType.findUnique({ where: { id: linkedRoomTypeId } })
        : null;

      if (!roomType) {
        roomType = await tx.roomType.findFirst({ where: { name: desiredName } });
      }

      if (!roomType) {
        const uniqueName = await resolveUniqueRoomTypeName(tx, desiredName, extType.id);
        const created = await tx.roomType.create({
          data: {
            name: uniqueName,
            description: desiredDescription,
            basePrice: IMPORTED_ROOM_TYPE_BASE_PRICE,
            maxOccupancy: desiredMaxOccupancy,
          },
        });
        await writeAuditLog(tx, {
          entityType: 'room_type',
          entityId: created.id,
          action: 'create',
          changes: {
            source: MOTOPRESS_PROVIDER,
            externalAccommodationTypeId: externalTypeId,
          },
          actor: getActor(actorId),
        });
        result.roomTypes.created += 1;
        roomTypeIdByExternalTypeId.set(externalTypeId, created.id);
        continue;
      }

      const uniqueName = await resolveUniqueRoomTypeName(tx, desiredName, extType.id, roomType.id);
      const updateData: Prisma.RoomTypeUpdateInput = {};
      if (roomType.name !== uniqueName) updateData.name = uniqueName;
      if ((roomType.description ?? null) !== desiredDescription) updateData.description = desiredDescription;
      if (roomType.maxOccupancy !== desiredMaxOccupancy) updateData.maxOccupancy = desiredMaxOccupancy;

      if (Object.keys(updateData).length > 0) {
        await tx.roomType.update({ where: { id: roomType.id }, data: updateData });
        await writeAuditLog(tx, {
          entityType: 'room_type',
          entityId: roomType.id,
          action: 'update',
          changes: {
            source: MOTOPRESS_PROVIDER,
            externalAccommodationTypeId: externalTypeId,
            updateData,
          },
          actor: getActor(actorId),
        });
        result.roomTypes.updated += 1;
      }

      roomTypeIdByExternalTypeId.set(externalTypeId, roomType.id);
    }

    const externalTypeMap = new Map(activeRoomTypes.map((item) => [String(item.id), item] as const));

    for (const extRoom of activeRooms) {
      const externalAccommodationId = String(extRoom.id);
      const externalTypeId = extRoom.accommodation_type_id ? String(extRoom.accommodation_type_id) : null;
      const externalType = externalTypeId ? externalTypeMap.get(externalTypeId) : undefined;

      let roomTypeId = externalTypeId ? roomTypeIdByExternalTypeId.get(externalTypeId) : undefined;
      if (!roomTypeId) {
        roomTypeId = await ensureFallbackMotopressRoomType(tx, actorId);
      }

      const desiredRoomName = normalizeName(extRoom.title, `MotoPress Room ${extRoom.id}`);
      const desiredRoomStatus = mapMotopressAccommodationStatus(extRoom.status);

      const mapping = mappingByAccommodationId.get(externalAccommodationId);

      if (!mapping) {
        const uniqueRoomName = await resolveUniqueRoomName(tx, desiredRoomName, extRoom.id);
        const createdRoom = await tx.room.create({
          data: {
            name: uniqueRoomName,
            roomTypeId,
            status: desiredRoomStatus,
          },
        });
        await writeAuditLog(tx, {
          entityType: 'room',
          entityId: createdRoom.id,
          action: 'create',
          changes: {
            source: MOTOPRESS_PROVIDER,
            externalAccommodationId,
          },
          actor: getActor(actorId),
        });
        result.rooms.created += 1;

        const createdMapping = await tx.roomExternalMapping.create({
          data: {
            roomId: createdRoom.id,
            provider: MOTOPRESS_PROVIDER,
            externalAccommodationId,
            externalAccommodationTypeId: externalTypeId,
            defaultAdults: deriveDefaultAdults(externalType),
            defaultChildren: deriveDefaultChildren(externalType),
          },
        });
        await writeAuditLog(tx, {
          entityType: 'room_external_mapping',
          entityId: createdMapping.id,
          action: 'create',
          changes: {
            source: MOTOPRESS_PROVIDER,
            externalAccommodationId,
            externalAccommodationTypeId: externalTypeId,
          },
          actor: getActor(actorId),
        });
        result.mappings.created += 1;
        continue;
      }

      const roomUpdateData: Prisma.RoomUpdateInput = {};
      const uniqueRoomName = await resolveUniqueRoomName(tx, desiredRoomName, extRoom.id, mapping.room.id);
      if (mapping.room.name !== uniqueRoomName) roomUpdateData.name = uniqueRoomName;
      if (mapping.room.roomTypeId !== roomTypeId) roomUpdateData.roomType = { connect: { id: roomTypeId } };
      if (mapping.room.status !== desiredRoomStatus) roomUpdateData.status = desiredRoomStatus;

      if (Object.keys(roomUpdateData).length > 0) {
        await tx.room.update({
          where: { id: mapping.room.id },
          data: roomUpdateData,
        });
        await writeAuditLog(tx, {
          entityType: 'room',
          entityId: mapping.room.id,
          action: 'update',
          changes: {
            source: MOTOPRESS_PROVIDER,
            externalAccommodationId,
            roomUpdateData,
          },
          actor: getActor(actorId),
        });
        result.rooms.updated += 1;
      }

      const mappingUpdateData: Prisma.RoomExternalMappingUpdateInput = {};
      if ((mapping.externalAccommodationTypeId ?? null) !== externalTypeId) {
        mappingUpdateData.externalAccommodationTypeId = externalTypeId;
      }
      const nextAdults = deriveDefaultAdults(externalType);
      if ((mapping.defaultAdults ?? null) !== nextAdults) {
        mappingUpdateData.defaultAdults = nextAdults;
      }
      const nextChildren = deriveDefaultChildren(externalType);
      if ((mapping.defaultChildren ?? null) !== nextChildren) {
        mappingUpdateData.defaultChildren = nextChildren;
      }

      if (Object.keys(mappingUpdateData).length > 0) {
        await tx.roomExternalMapping.update({
          where: { id: mapping.id },
          data: mappingUpdateData,
        });
        await writeAuditLog(tx, {
          entityType: 'room_external_mapping',
          entityId: mapping.id,
          action: 'update',
          changes: {
            source: MOTOPRESS_PROVIDER,
            externalAccommodationId,
            mappingUpdateData,
          },
          actor: getActor(actorId),
        });
        result.mappings.updated += 1;
      }
    }
  });

  return result;
}

async function listAllMotopressAccommodationTypes(
  client: ReturnType<typeof createMotopressClientFromEnv>,
): Promise<MotopressAccommodationType[]> {
  const items: MotopressAccommodationType[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const chunk = await client.listAccommodationTypes({
      page,
      per_page: MOTOPRESS_PAGE_SIZE,
      context: 'view',
    });
    items.push(...chunk);
    if (chunk.length < MOTOPRESS_PAGE_SIZE) break;
  }
  return items;
}

async function listAllMotopressAccommodations(
  client: ReturnType<typeof createMotopressClientFromEnv>,
): Promise<MotopressAccommodation[]> {
  const items: MotopressAccommodation[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const chunk = await client.listAccommodations({
      page,
      per_page: MOTOPRESS_PAGE_SIZE,
      context: 'view',
    });
    items.push(...chunk);
    if (chunk.length < MOTOPRESS_PAGE_SIZE) break;
  }
  return items;
}

async function resolveUniqueRoomTypeName(
  prisma: PrismaClientOrTx,
  desiredName: string,
  externalTypeId: number,
  existingRoomTypeId?: string,
): Promise<string> {
  return resolveUniqueName({
    desiredName,
    fallbackSuffix: `MP Type ${externalTypeId}`,
    lookup: async (name: string) => prisma.roomType.findFirst({
      where: {
        name,
        ...(existingRoomTypeId ? { id: { not: existingRoomTypeId } } : {}),
      },
      select: { id: true },
    }),
  });
}

async function resolveUniqueRoomName(
  prisma: PrismaClientOrTx,
  desiredName: string,
  externalAccommodationId: number,
  existingRoomId?: string,
): Promise<string> {
  return resolveUniqueName({
    desiredName,
    fallbackSuffix: `MP Room ${externalAccommodationId}`,
    lookup: async (name: string) => prisma.room.findFirst({
      where: {
        name,
        ...(existingRoomId ? { id: { not: existingRoomId } } : {}),
      },
      select: { id: true },
    }),
  });
}

async function resolveUniqueName(args: {
  desiredName: string;
  fallbackSuffix: string;
  lookup: (name: string) => Promise<{ id: string } | null>;
}): Promise<string> {
  const baseName = args.desiredName.trim();
  if (!baseName) return `Imported ${args.fallbackSuffix}`;

  const plain = baseName;
  if (!(await args.lookup(plain))) return plain;

  const withSuffix = `${baseName} (${args.fallbackSuffix})`;
  if (!(await args.lookup(withSuffix))) return withSuffix;

  for (let i = 2; i <= 100; i += 1) {
    const candidate = `${withSuffix} ${i}`;
    if (!(await args.lookup(candidate))) return candidate;
  }

  throw new ConflictError(`Could not resolve unique name for '${baseName}'`);
}

function deriveMaxOccupancy(type: MotopressAccommodationType): number {
  const values = [
    type.total_capacity,
    sumIfPresent(type.adults, type.children),
    sumIfPresent(type.base_adults, type.base_children),
    type.adults,
    type.base_adults,
  ];

  for (const value of values) {
    if (Number.isInteger(value) && Number(value) > 0) return Number(value);
  }
  return 1;
}

function deriveDefaultAdults(type?: MotopressAccommodationType): number {
  const values = [type?.base_adults, type?.adults, 1];
  for (const value of values) {
    if (Number.isInteger(value) && Number(value) > 0) return Number(value);
  }
  return 1;
}

function deriveDefaultChildren(type?: MotopressAccommodationType): number {
  const values = [type?.base_children, type?.children, 0];
  for (const value of values) {
    if (Number.isInteger(value) && Number(value) >= 0) return Number(value);
  }
  return 0;
}

function mapMotopressAccommodationStatus(status: string): 'available' | 'maintenance' {
  return status === 'publish' ? 'available' : 'maintenance';
}

function normalizeName(value: string | null | undefined, fallback: string): string {
  const cleaned = (value ?? '').replace(/\s+/g, ' ').trim();
  if (cleaned) return cleaned;
  return fallback;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const cleaned = (value ?? '').trim();
  return cleaned ? cleaned : null;
}

function sumIfPresent(a?: number | null, b?: number | null): number | undefined {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return undefined;
  return Number(a) + Number(b);
}

async function ensureFallbackMotopressRoomType(
  tx: PrismaClientOrTx,
  actorId?: string,
): Promise<string> {
  const existing = await tx.roomType.findFirst({
    where: { name: 'MotoPress Unassigned' },
  });
  if (existing) return existing.id;

  const created = await tx.roomType.create({
    data: {
      name: 'MotoPress Unassigned',
      description: 'Auto-created for imported MotoPress rooms without a known accommodation type.',
      basePrice: IMPORTED_ROOM_TYPE_BASE_PRICE,
      maxOccupancy: 1,
    },
  });

  await writeAuditLog(tx, {
    entityType: 'room_type',
    entityId: created.id,
    action: 'create',
    changes: { source: MOTOPRESS_PROVIDER, reason: 'fallback_room_type' },
    actor: getActor(actorId),
  });

  return created.id;
}
