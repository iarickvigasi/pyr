-- AlterTable: Add isRead to conversations
ALTER TABLE "conversations" ADD COLUMN "is_read" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: Add sourceConversationId and needsReview to bookings
ALTER TABLE "bookings" ADD COLUMN "source_conversation_id" TEXT;
ALTER TABLE "bookings" ADD COLUMN "needs_review" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: Attachment
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content_id" TEXT,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Attachment messageId
CREATE INDEX "attachments_message_id_idx" ON "attachments"("message_id");

-- CreateIndex: Conversation status + isRead composite index
CREATE INDEX "conversations_status_is_read_idx" ON "conversations"("status", "is_read");

-- AddForeignKey: Attachment -> Message (cascade delete)
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Booking -> Conversation (sourceConversation)
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_source_conversation_id_fkey" FOREIGN KEY ("source_conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
