/*
  Warnings:

  - You are about to drop the column `received_at` on the `payments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "payments" DROP COLUMN "received_at",
ADD COLUMN     "deleted_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "payments_deleted_at_idx" ON "payments"("deleted_at");
