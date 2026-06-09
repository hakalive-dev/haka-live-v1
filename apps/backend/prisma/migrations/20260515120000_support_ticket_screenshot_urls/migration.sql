-- Add multi-screenshot support; backfill from legacy screenshotUrl column.
ALTER TABLE "support_tickets" ADD COLUMN "screenshotUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "support_tickets"
SET "screenshotUrls" = ARRAY["screenshotUrl"]
WHERE "screenshotUrl" <> '' AND cardinality("screenshotUrls") = 0;
