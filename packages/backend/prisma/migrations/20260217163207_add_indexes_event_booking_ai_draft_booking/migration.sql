-- DropIndex
DROP INDEX "bookings_deleted_at_idx";

-- DropIndex
DROP INDEX "bookings_status_idx";

-- CreateIndex
CREATE INDEX "ai_drafts_message_id_idx" ON "ai_drafts"("message_id");

-- CreateIndex
CREATE INDEX "bookings_deleted_at_status_idx" ON "bookings"("deleted_at", "status");

-- CreateIndex
CREATE INDEX "event_bookings_guest_id_idx" ON "event_bookings"("guest_id");
