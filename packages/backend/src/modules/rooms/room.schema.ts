import { z } from 'zod';
import { paginationQuerySchema } from '@pyr/shared';

// Room Types
export const createRoomTypeSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).nullish(),
  basePrice: z.number().int().min(0),
  maxOccupancy: z.number().int().min(1),
});

export type CreateRoomTypeBody = z.infer<typeof createRoomTypeSchema>;

export const updateRoomTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).nullish(),
  basePrice: z.number().int().min(0).optional(),
  maxOccupancy: z.number().int().min(1).optional(),
});

export type UpdateRoomTypeBody = z.infer<typeof updateRoomTypeSchema>;

// Rooms
export const createRoomSchema = z.object({
  roomTypeId: z.string().min(1),
  name: z.string().min(1).max(100),
  status: z.enum(['available', 'occupied', 'maintenance']).default('available'),
});

export type CreateRoomBody = z.infer<typeof createRoomSchema>;

export const updateRoomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(['available', 'occupied', 'maintenance']).optional(),
});

export type UpdateRoomBody = z.infer<typeof updateRoomSchema>;

// Seasons
export const createSeasonSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.string().date(),
  endDate: z.string().date(),
  priceMultiplier: z.number().min(0.01).max(99.99),
});

export type CreateSeasonBody = z.infer<typeof createSeasonSchema>;

export const updateSeasonSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  priceMultiplier: z.number().min(0.01).max(99.99).optional(),
});

export type UpdateSeasonBody = z.infer<typeof updateSeasonSchema>;

// Availability
export const availabilityQuerySchema = z.object({
  checkIn: z.string().date(),
  checkOut: z.string().date(),
  roomTypeId: z.string().optional(),
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const listRoomsQuerySchema = paginationQuerySchema;
