-- AlterTable
ALTER TABLE "ai_drafts" ADD COLUMN     "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cache_write_tokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cost_eur" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "duration_ms" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "input_tokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "output_tokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'anthropic';
