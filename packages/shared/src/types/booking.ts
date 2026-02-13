import type { BookingStatus } from '../constants/booking-status.js';

export interface Booking {
  id: string;
  guestId: string;
  roomId: string;
  checkIn: Date;
  checkOut: Date;
  status: BookingStatus;
  totalPrice: number;
  source: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface BookingCreate {
  guestId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  status?: BookingStatus;
  totalPrice: number;
  source?: string | null;
  notes?: string | null;
}

export interface BookingUpdate {
  roomId?: string;
  checkIn?: string;
  checkOut?: string;
  status?: BookingStatus;
  totalPrice?: number;
  source?: string | null;
  notes?: string | null;
}
