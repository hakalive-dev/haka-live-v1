-- AlterTable: promote Family bean counters to bigint.
-- Active families accumulate beans indefinitely; totalBeans can exceed INT4 max (~2.1B)
-- over months of high-volume activity.

ALTER TABLE "families"
  ALTER COLUMN "weeklyBeans" TYPE BIGINT,
  ALTER COLUMN "totalBeans" TYPE BIGINT;
