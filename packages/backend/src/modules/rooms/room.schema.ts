import 'zod-openapi/extend';
import { z } from 'zod';

// Room Types
export const createRoomTypeSchema = z.object({
  name: z.string().min(1).max(100).openapi({ example: 'Deluxe Suite' }),
  description: z.string().max(1000).nullish().openapi({ example: 'Spacious suite with garden view and private terrace.' }),
  basePrice: z.number().int().min(0).openapi({ example: 15000 }),
  maxOccupancy: z.number().int().min(1).openapi({ example: 2 }),
});

export type CreateRoomTypeBody = z.infer<typeof createRoomTypeSchema>;

export const updateRoomTypeSchema = z.object({
  name: z.string().min(1).max(100).optional().openapi({ example: 'Premium Suite' }),
  description: z.string().max(1000).nullish().openapi({ example: 'Updated description with sea view.' }),
  basePrice: z.number().int().min(0).optional().openapi({ example: 18000 }),
  maxOccupancy: z.number().int().min(1).optional().openapi({ example: 3 }),
});

export type UpdateRoomTypeBody = z.infer<typeof updateRoomTypeSchema>;

// Rooms
export const createRoomSchema = z.object({
  roomTypeId: z.string().min(1).openapi({ example: 'cm4x7abc00020' }),
  name: z.string().min(1).max(100).openapi({ example: 'Sunset Suite' }),
  status: z.enum(['available', 'occupied', 'maintenance']).default('available').openapi({ example: 'available' }),
});

export type CreateRoomBody = z.infer<typeof createRoomSchema>;

export const updateRoomSchema = z.object({
  name: z.string().min(1).max(100).optional().openapi({ example: 'Garden Room' }),
  status: z.enum(['available', 'occupied', 'maintenance']).optional().openapi({ example: 'maintenance' }),
});

export type UpdateRoomBody = z.infer<typeof updateRoomSchema>;

// Seasons
export const createSeasonSchema = z.object({
  name: z.string().min(1).max(100).openapi({ example: 'Summer 2026' }),
  startDate: z.string().date().openapi({ example: '2026-06-01' }),
  endDate: z.string().date().openapi({ example: '2026-09-30' }),
  priceMultiplier: z.number().min(0.01).max(99.99).openapi({ example: 1.25 }),
});

export type CreateSeasonBody = z.infer<typeof createSeasonSchema>;

export const updateSeasonSchema = z.object({
  name: z.string().min(1).max(100).optional().openapi({ example: 'Peak Summer 2026' }),
  startDate: z.string().date().optional().openapi({ example: '2026-07-01' }),
  endDate: z.string().date().optional().openapi({ example: '2026-08-31' }),
  priceMultiplier: z.number().min(0.01).max(99.99).optional().openapi({ example: 1.50 }),
});

export type UpdateSeasonBody = z.infer<typeof updateSeasonSchema>;

// Availability
export const availabilityQuerySchema = z.object({
  checkIn: z.string().date().openapi({ example: '2026-04-15' }),
  checkOut: z.string().date().openapi({ example: '2026-04-22' }),
  roomTypeId: z.string().optional().openapi({ example: 'cm4x7abc00020' }),
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
