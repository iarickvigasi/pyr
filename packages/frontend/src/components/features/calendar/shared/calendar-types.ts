export interface CalendarBookingItem {
  id: string;
  guestName: string;
  roomName: string;
  roomTypeName: string;
  checkIn: Date;
  checkOut: Date;
  status: string;
}

export interface CalendarEventItem {
  id: string;
  type: string;
  title: string;
  date: Date;
  time: string;
  capacity: number;
  registeredCount: number;
}

export interface BookingBarSegment {
  booking: CalendarBookingItem;
  startCol: number;
  endCol: number;
  slotIndex: number;
}

export type ViewMode = 'month' | 'week';
