// Calendar sync job — implemented in E7 (Calendar & Apple Calendar Sync).
// Triggered after booking or event mutations to push changes to Apple Calendar via CalDAV.
// Business rule: data flows ONE WAY — DB → Apple Calendar. This job never reads from
// CalDAV to update the DB. See: services/caldav/caldav.service.ts for the sync logic.
export {};
