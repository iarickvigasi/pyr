import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';
import { formatEurCents } from '../lib/formatters.js';

interface Room {
  id: string;
  name: string;
  status: string;
  roomType?: { id: string; name: string; basePrice: number; maxOccupancy: number };
}

interface RoomType {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  maxOccupancy: number;
}

interface AvailableRoom {
  id: string;
  name: string;
  roomType: { name: string; basePrice: number; maxOccupancy: number };
  totalPrice?: number;
}

export function registerRoomTools(api: OpenClawPluginApi, client: ApiClient): void {
  api.registerTool({
    name: 'list_rooms',
    label: 'List Rooms',
    description:
      'List all physical rooms at the villa with their current status and room type. Useful for seeing which rooms exist and their status.',
    parameters: Type.Object({}),
    async execute() {
      const data = await client.get<Room[]>('/api/v1/rooms');
      const rooms = (data as unknown as Room[]).map(r => ({
        name: r.name,
        status: r.status,
        roomType: r.roomType?.name,
        basePrice: r.roomType ? formatEurCents(r.roomType.basePrice) : null,
        maxOccupancy: r.roomType?.maxOccupancy,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify({ rooms }, null, 2) }], details: {} };
    },
  });

  api.registerTool({
    name: 'list_room_types',
    label: 'List Room Types',
    description:
      'List all room type categories with pricing and capacity. Shows base price per night and maximum occupancy for each type (Suite, Standard, etc.).',
    parameters: Type.Object({}),
    async execute() {
      const data = await client.get<RoomType[]>('/api/v1/room-types');
      const roomTypes = (data as unknown as RoomType[]).map(rt => ({
        name: rt.name,
        description: rt.description,
        basePrice: formatEurCents(rt.basePrice),
        maxOccupancy: rt.maxOccupancy,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify({ roomTypes }, null, 2) }], details: {} };
    },
  });

  api.registerTool({
    name: 'check_availability',
    label: 'Check Room Availability',
    description:
      'Check room availability for a specific date range. Returns which rooms are available and their pricing for the given dates. Use for "Is anything available March 15-19?" or "Which rooms are free next week?".',
    parameters: Type.Object({
      from: Type.String({ description: 'Check-in date (ISO format, e.g., 2026-03-15)' }),
      to: Type.String({ description: 'Check-out date (ISO format, e.g., 2026-03-19)' }),
    }),
    async execute(_id: string, params: { from: string; to: string }) {
      const data = await client.get<AvailableRoom[]>('/api/v1/availability', {
        from: params.from,
        to: params.to,
      });
      const available = (data as unknown as AvailableRoom[]).map(r => ({
        roomName: r.name,
        roomType: r.roomType?.name,
        basePrice: r.roomType ? formatEurCents(r.roomType.basePrice) : null,
        maxOccupancy: r.roomType?.maxOccupancy,
        totalPrice: r.totalPrice ? formatEurCents(r.totalPrice) : null,
      }));
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            dateRange: { from: params.from, to: params.to },
            availableRooms: available,
            totalAvailable: available.length,
          }, null, 2),
        }],
        details: {},
      };
    },
  });
}
