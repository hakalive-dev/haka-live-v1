-- Add agency operational limits (0 = unlimited)

ALTER TABLE "agencies"
  ADD COLUMN "hostLimit" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "withdrawalLimitBeans" BIGINT NOT NULL DEFAULT 0;

