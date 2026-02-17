-- DropIndex
DROP INDEX "idx_audit_log_actor";

-- DropIndex
DROP INDEX "idx_event_bookings_status";

-- DropIndex
DROP INDEX "idx_events_upcoming";

-- DropIndex
DROP INDEX "idx_messages_conversation_sent";

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");
