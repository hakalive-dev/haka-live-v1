-- Time-bounded manual commission / gift-bonus overrides (per Agency).
ALTER TABLE "agencies" ADD COLUMN "commissionRateOverrideValidUntil" TIMESTAMPTZ;
ALTER TABLE "agencies" ADD COLUMN "giftBonusRateOverrideValidUntil" TIMESTAMPTZ;
