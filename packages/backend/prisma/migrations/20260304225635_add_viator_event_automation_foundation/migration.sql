-- CreateEnum
CREATE TYPE "conversation_event_analysis_status" AS ENUM ('pending', 'ready', 'insufficient_data', 'not_applicable', 'error');

-- AlterTable
ALTER TABLE "event_bookings" ADD COLUMN     "attendee_count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "external_booking_id" TEXT,
ADD COLUMN     "external_product_code" TEXT,
ADD COLUMN     "external_provider" TEXT,
ADD COLUMN     "source_conversation_id" TEXT;

-- CreateTable
CREATE TABLE "conversation_event_analyses" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT,
    "provider" TEXT NOT NULL,
    "status" "conversation_event_analysis_status" NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL,
    "classification" TEXT,
    "intent" TEXT,
    "missing_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "candidate_json" JSONB,
    "resolution_json" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversation_event_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_event_analyses_conversation_id_key" ON "conversation_event_analyses"("conversation_id");

-- CreateIndex
CREATE INDEX "conversation_event_analyses_message_id_idx" ON "conversation_event_analyses"("message_id");

-- CreateIndex
CREATE INDEX "conversation_event_analyses_status_idx" ON "conversation_event_analyses"("status");

-- CreateIndex
CREATE INDEX "conversation_event_analyses_provider_idx" ON "conversation_event_analyses"("provider");

-- CreateIndex
CREATE INDEX "event_bookings_source_conversation_id_idx" ON "event_bookings"("source_conversation_id");

-- CreateIndex
CREATE INDEX "event_bookings_external_provider_external_booking_id_idx" ON "event_bookings"("external_provider", "external_booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_bookings_external_provider_external_booking_id_key" ON "event_bookings"("external_provider", "external_booking_id");

-- AddForeignKey
ALTER TABLE "event_bookings" ADD CONSTRAINT "event_bookings_source_conversation_id_fkey" FOREIGN KEY ("source_conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_event_analyses" ADD CONSTRAINT "conversation_event_analyses_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_event_analyses" ADD CONSTRAINT "conversation_event_analyses_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

