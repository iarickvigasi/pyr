-- Create sync status enum for external provider synchronization lifecycle
CREATE TYPE "sync_status" AS ENUM ('pending', 'synced', 'failed');

-- Booking sync metadata
ALTER TABLE "bookings"
  ADD COLUMN "external_provider" TEXT,
  ADD COLUMN "external_booking_id" TEXT,
  ADD COLUMN "sync_status" "sync_status" NOT NULL DEFAULT 'pending',
  ADD COLUMN "sync_error" TEXT,
  ADD COLUMN "last_synced_at" TIMESTAMPTZ(3),
  ADD COLUMN "sync_version" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "bookings_sync_status_last_synced_at_idx"
  ON "bookings" ("sync_status", "last_synced_at");

CREATE UNIQUE INDEX "bookings_external_provider_external_booking_id_key"
  ON "bookings" ("external_provider", "external_booking_id");

-- Provider-specific room mapping
CREATE TABLE "room_external_mappings" (
  "id" TEXT NOT NULL,
  "room_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "external_accommodation_id" TEXT NOT NULL,
  "external_accommodation_type_id" TEXT,
  "default_adults" INTEGER,
  "default_children" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "room_external_mappings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "room_external_mappings_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "room_external_mappings_room_id_provider_key"
  ON "room_external_mappings" ("room_id", "provider");

CREATE UNIQUE INDEX "room_external_mappings_provider_external_accommodation_id_key"
  ON "room_external_mappings" ("provider", "external_accommodation_id");

CREATE INDEX "room_external_mappings_provider_idx"
  ON "room_external_mappings" ("provider");
