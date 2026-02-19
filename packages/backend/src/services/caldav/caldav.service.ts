// CalDAV sync service — implemented in E7 (Calendar & Apple Calendar Sync).
// Pushes bookings and events to Apple Calendar via CalDAV protocol (iCloud endpoint).
// Business rule: data flows ONE WAY — DB → Apple Calendar. Never read from CalDAV
// to update DB. The calendar_events table tracks which DB records have been synced
// (caldav_uid, last_synced) so updates can be sent as VEVENT PUT/DELETE operations.
// See: modules/calendar/calendar.routes.ts for the API endpoint that triggers sync.
export {};
