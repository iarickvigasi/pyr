import type { PrismaClient, Prisma } from '@prisma/client';
import { writeAuditLog, getActor } from '../../lib/audit.js';
import { computeChanges, handleUniqueConstraint } from '../../lib/prisma-helpers.js';
import { NotFoundError, BadRequestError, ConflictError } from '../../lib/errors.js';
import type { PrismaClientOrTx } from '../../types/prisma.js';
import {
  createMotopressClientFromEnv,
  type MotopressAccommodation,
  type MotopressAccommodationType,
  type MotopressEnv,
} from '../../services/motopress/index.js';
import type {
  CreateRoomTypeBody,
  UpdateRoomTypeBody,
  CreateRoomBody,
  UpdateRoomBody,
  ListRoomExternalMappingsQuery,
  CreateRoomExternalMappingBody,
  UpdateRoomExternalMappingBody,
  CreateSeasonBody,
  UpdateSeasonBody,
  AvailabilityQuery,
} from './room.schema.js';
import type { RoomType, RoomWithType, Season } from '../../types/entities.js';

const MOTOPRESS_PROVIDER = 'motopress';
const MOTOPRESS_PAGE_SIZE = 100;
const IMPORTED_ROOM_TYPE_BASE_PRICE = 100;

// ─── Room Types ──────────────────────────────────────────

export async function listRoomTypes(prisma: PrismaClient): Promise<(RoomType & { rooms: { id: string; name: string; status: string }[] })[]> {
  const result = await prisma.roomType.findMany({
    include: { rooms: true },
    orderBy: { name: 'asc' },
  });
  return result as (RoomType & { rooms: { id: string; name: string; status: string }[] })[];
}

export async function createRoomType(
  prisma: PrismaClient,
  data: CreateRoomTypeBody,
  actorId?: string,
): Promise<RoomType> {
  return prisma.$transaction(async (tx) => {
    const roomType = await tx.roomType.create({ data }).catch((err: unknown) => {
      handleUniqueConstraint(err, 'RoomType');
    });

    await writeAuditLog(tx, {
      entityType: 'room_type',
      entityId: roomType.id,
      action: 'create',
      changes: data as unknown as Record<string, unknown>,
      actor: getActor(actorId),
    });

    return roomType as RoomType;
  });
}

export async function updateRoomType(
  prisma: PrismaClient,
  id: string,
  data: UpdateRoomTypeBody,
  actorId?: string,
): Promise<RoomType> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.roomType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('RoomType', id);

    const updated = await tx.roomType.update({ where: { id }, data }).catch((err: unknown) => {
      handleUniqueConstraint(err, 'RoomType');
    });

    const changes = computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );
    if (changes) {
      await writeAuditLog(tx, {
        entityType: 'room_type',
        entityId: id,
        action: 'update',
        changes,
        actor: getActor(actorId),
      });
    }

    return updated as RoomType;
  });
}

export async function deleteRoomType(
  prisma: PrismaClient,
  id: string,
  actorId?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.roomType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('RoomType', id);

    const roomsCount = await tx.room.count({ where: { roomTypeId: id } });
    if (roomsCount > 0) {
      throw new ConflictError(
        `Cannot delete room type '${existing.name}' because ${roomsCount} room(s) still use it`,
      );
    }

    await tx.roomType.delete({ where: { id } });

    await writeAuditLog(tx, {
      entityType: 'room_type',
      entityId: id,
      action: 'delete',
      actor: getActor(actorId),
    });
  });
}

// ─── Rooms ───────────────────────────────────────────────

export async function listRooms(prisma: PrismaClient): Promise<RoomWithType[]> {
  const result = await prisma.room.findMany({
    include: { roomType: true },
    orderBy: { name: 'asc' },
  });
  return result as RoomWithType[];
}

export async function createRoom(
  prisma: PrismaClient,
  data: CreateRoomBody,
  actorId?: string,
): Promise<RoomWithType> {
  return prisma.$transaction(async (tx) => {
    const roomType = await tx.roomType.findUnique({ where: { id: data.roomTypeId } });
    if (!roomType) throw new NotFoundError('RoomType', data.roomTypeId);

    const room = await tx.room.create({ data }).catch((err: unknown) => {
      handleUniqueConstraint(err, 'Room');
    });

    await writeAuditLog(tx, {
      entityType: 'room',
      entityId: room.id,
      action: 'create',
      changes: data as unknown as Record<string, unknown>,
      actor: getActor(actorId),
    });

    return room as RoomWithType;
  });
}

export async function updateRoom(
  prisma: PrismaClient,
  id: string,
  data: UpdateRoomBody,
  actorId?: string,
): Promise<RoomWithType> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.room.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Room', id);

    const updated = await tx.room.update({ where: { id }, data }).catch((err: unknown) => {
      handleUniqueConstraint(err, 'Room');
    });

    const changes = computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );
    if (changes) {
      await writeAuditLog(tx, {
        entityType: 'room',
        entityId: id,
        action: 'update',
        changes,
        actor: getActor(actorId),
      });
    }

    return updated as RoomWithType;
  });
}

export async function deleteRoom(
  prisma: PrismaClient,
  id: string,
  actorId?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.room.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Room', id);

    // Active (non-soft-deleted) bookings must block room deletion.
    const activeBookingsCount = await tx.booking.count({
      where: {
        roomId: id,
        deletedAt: null,
        status: { in: ['inquiry', 'confirmed', 'checked_in'] },
      },
    });
    if (activeBookingsCount > 0) {
      throw new ConflictError(
        `Cannot delete room '${existing.name}' because it has ${activeBookingsCount} active booking(s)`,
      );
    }

    // Purge cancelled + soft-deleted bookings to release FK references to this room.
    const archivedBookings = await tx.booking.findMany({
      where: {
        roomId: id,
        OR: [
          { deletedAt: { not: null } },
          { status: 'cancelled' },
        ],
      },
      select: { id: true },
    });
    if (archivedBookings.length > 0) {
      const archivedBookingIds = archivedBookings.map((b) => b.id);
      const linkedInvoicesCount = await tx.invoice.count({
        where: { bookingId: { in: archivedBookingIds } },
      });
      if (linkedInvoicesCount > 0) {
        throw new ConflictError(
          `Cannot delete room '${existing.name}' because archived bookings still have ${linkedInvoicesCount} invoice(s)`,
        );
      }

      // Calendar rows tied to booking-only entries would violate chk_calendar_event_xor
      // when booking_id gets nulled by FK on booking delete. Purge them first.
      await tx.calendarEvent.deleteMany({
        where: { bookingId: { in: archivedBookingIds } },
      });

      await tx.booking.deleteMany({
        where: { id: { in: archivedBookingIds } },
      });
    }

    await tx.room.delete({ where: { id } });

    await writeAuditLog(tx, {
      entityType: 'room',
      entityId: id,
      action: 'delete',
      changes: {
        purgedArchivedBookings: archivedBookings.length,
      },
      actor: getActor(actorId),
    });
  });
}

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

// ─── Seasons ─────────────────────────────────────────────

export async function listSeasons(prisma: PrismaClient): Promise<Season[]> {
  const result = await prisma.season.findMany({ orderBy: { startDate: 'asc' } });
  return result as Season[];
}

async function checkSeasonOverlap(
  prisma: PrismaClientOrTx,
  startDate: Date,
  endDate: Date,
  excludeId?: string,
): Promise<void> {
  const where: Prisma.SeasonWhereInput = {
    startDate: { lt: endDate },
    endDate: { gt: startDate },
  };
  if (excludeId) {
    where.id = { not: excludeId };
  }
  const overlap = await prisma.season.findFirst({ where });
  if (overlap) {
    throw new ConflictError(`Season overlaps with existing season '${overlap.name}'`);
  }
}

export async function createSeason(
  prisma: PrismaClient,
  data: CreateSeasonBody,
  actorId?: string,
): Promise<Season> {
  if (data.endDate <= data.startDate) {
    throw new BadRequestError('End date must be after start date');
  }

  return prisma.$transaction(async (tx) => {
    await checkSeasonOverlap(tx, new Date(data.startDate), new Date(data.endDate));

    const season = await tx.season.create({
      data: {
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        priceMultiplier: data.priceMultiplier,
      },
    });

    await writeAuditLog(tx, {
      entityType: 'season',
      entityId: season.id,
      action: 'create',
      changes: data as unknown as Record<string, unknown>,
      actor: getActor(actorId),
    });

    return season as Season;
  });
}

export async function updateSeason(
  prisma: PrismaClient,
  id: string,
  data: UpdateSeasonBody,
  actorId?: string,
): Promise<Season> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.season.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Season', id);

    const startDate = data.startDate ? new Date(data.startDate) : undefined;
    const endDate = data.endDate ? new Date(data.endDate) : undefined;

    // Validate the resulting date range
    const effectiveStart = startDate ?? existing.startDate;
    const effectiveEnd = endDate ?? existing.endDate;
    if (effectiveEnd <= effectiveStart) {
      throw new BadRequestError('End date must be after start date');
    }

    // Check for overlapping seasons (excluding self)
    await checkSeasonOverlap(tx, effectiveStart, effectiveEnd, id);

    const updated = await tx.season.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(data.priceMultiplier !== undefined ? { priceMultiplier: data.priceMultiplier } : {}),
      },
    });

    const changes = computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );
    if (changes) {
      await writeAuditLog(tx, {
        entityType: 'season',
        entityId: id,
        action: 'update',
        changes,
        actor: getActor(actorId),
      });
    }

    return updated as Season;
  });
}

// ─── Availability ────────────────────────────────────────

export interface AvailableRoom {
  room: { id: string; name: string; status: string };
  roomType: { id: string; name: string; basePrice: number; maxOccupancy: number };
  nights: number;
  pricePerNight: number;
  totalPrice: number;
  seasonMultiplier: number;
}

export async function checkAvailability(
  prisma: PrismaClient,
  query: AvailabilityQuery,
): Promise<AvailableRoom[]> {
  const checkIn = new Date(query.checkIn);
  const checkOut = new Date(query.checkOut);

  if (checkOut <= checkIn) {
    throw new BadRequestError('Check-out date must be after check-in date');
  }

  // Find rooms with overlapping active bookings
  const overlappingBookings = await prisma.booking.findMany({
    where: {
      deletedAt: null,
      status: { in: ['inquiry', 'confirmed', 'checked_in'] },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { roomId: true },
  });

  const bookedRoomIds = new Set(overlappingBookings.map((b) => b.roomId));

  // Get all rooms (optionally filtered by room type)
  const rooms = await prisma.room.findMany({
    where: {
      status: 'available',
      ...(query.roomTypeId ? { roomTypeId: query.roomTypeId } : {}),
    },
    include: { roomType: true },
  });

  // Find all applicable seasons for the date range
  const seasons = await prisma.season.findMany({
    where: {
      startDate: { lt: checkOut },
      endDate: { gt: checkIn },
    },
    orderBy: { startDate: 'asc' },
  });

  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

  return rooms
    .filter((room) => !bookedRoomIds.has(room.id))
    .map((room) => {
      // Calculate per-night pricing based on which season each night falls in
      let totalPrice = 0;
      for (let i = 0; i < nights; i++) {
        const nightDate = new Date(checkIn);
        nightDate.setDate(nightDate.getDate() + i);
        const season = seasons.find(
          (s) => nightDate >= s.startDate && nightDate < s.endDate,
        );
        // Convert Decimal via toString() to avoid IEEE 754 drift during coercion
        const multiplier = season ? Number(season.priceMultiplier.toString()) : 1.0;
        totalPrice += Math.round(room.roomType.basePrice * multiplier);
      }
      const pricePerNight = Math.round(totalPrice / nights);

      // Use first night's season multiplier as the representative
      const firstSeason = seasons.find(
        (s) => checkIn >= s.startDate && checkIn < s.endDate,
      );
      const seasonMultiplier = firstSeason ? Number(firstSeason.priceMultiplier.toString()) : 1.0;

      return {
        room: { id: room.id, name: room.name, status: room.status },
        roomType: {
          id: room.roomType.id,
          name: room.roomType.name,
          basePrice: room.roomType.basePrice,
          maxOccupancy: room.roomType.maxOccupancy,
        },
        nights,
        pricePerNight,
        totalPrice,
        seasonMultiplier,
      };
    });
}
