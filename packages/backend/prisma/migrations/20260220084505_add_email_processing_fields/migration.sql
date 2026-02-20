-- DropForeignKey
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_guest_id_fkey";

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "classification" TEXT,
ALTER COLUMN "guest_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "classification" TEXT,
ADD COLUMN     "from_address" TEXT,
ADD COLUMN     "from_name" TEXT,
ADD COLUMN     "html_content" TEXT,
ADD COLUMN     "raw_source" BYTEA,
ADD COLUMN     "subject" TEXT;

-- CreateIndex
CREATE INDEX "messages_from_address_idx" ON "messages"("from_address");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex (partial unique for email deduplication)
CREATE UNIQUE INDEX "messages_message_id_unique" ON "messages" ("message_id") WHERE "message_id" IS NOT NULL;
