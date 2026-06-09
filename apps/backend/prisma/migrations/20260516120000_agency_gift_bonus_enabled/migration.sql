-- Per-agency gift bonus program toggle (admin). Default true preserves existing behavior.
ALTER TABLE "agencies" ADD COLUMN "giftBonusEnabled" BOOLEAN NOT NULL DEFAULT true;
