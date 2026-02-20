export interface CalendarEvent {
  id: string;
  bookingId: string | null;
  eventId: string | null;
  caldavUid: string | null;
  caldavUrl: string | null;
  etag: string | null;
  syncStatus: string; // 'pending' | 'synced' | 'failed'
  lastError: string | null;
  sequence: number;
  lastSynced: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
