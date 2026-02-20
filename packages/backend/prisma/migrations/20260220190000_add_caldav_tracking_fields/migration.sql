-- AlterTable: Add CalDAV tracking fields to calendar_events
ALTER TABLE "calendar_events" ADD COLUMN "caldav_url" TEXT;
ALTER TABLE "calendar_events" ADD COLUMN "etag" TEXT;
ALTER TABLE "calendar_events" ADD COLUMN "sync_status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "calendar_events" ADD COLUMN "last_error" TEXT;
ALTER TABLE "calendar_events" ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "calendar_events_sync_status_idx" ON "calendar_events"("sync_status");
