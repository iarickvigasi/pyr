import type { EventType } from '../constants/event-types.js';
import type { EventBookingStatus } from '../constants/event-booking-status.js';

export interface Event {
  id: string;
  type: EventType;
  title: string;
  date: Date;
  time: string;
  capacity: number;
  location: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventBooking {
  id: string;
  eventId: string;
  guestId: string;
  status: EventBookingStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventCreate {
  type: EventType;
  title: string;
  date: string;
  time: string;
  capacity: number;
  location?: string | null;
  description?: string | null;
}
