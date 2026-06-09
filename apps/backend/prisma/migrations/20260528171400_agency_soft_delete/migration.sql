-- Soft delete support for agencies

ALTER TABLE "agencies"
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "agencies_deletedAt_idx" ON "agencies"("deletedAt");

