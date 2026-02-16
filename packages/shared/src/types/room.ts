import type { RoomStatus } from '../constants/room-status.js';

export interface Room {
  id: string;
  roomTypeId: string;
  name: string;
  status: RoomStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomType {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  maxOccupancy: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Season {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  priceMultiplier: number; // Prisma Decimal → serialized as number
  createdAt: Date;
  updatedAt: Date;
}
