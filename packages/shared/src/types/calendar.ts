export interface CalendarEvent {
  id: string;
  bookingId: string | null;
  eventId: string | null;
  caldavUid: string | null;
  lastSynced: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
