-- Change the default for applyForMic from true → false.
-- New rooms will be in free mode unless the host explicitly switches to apply mode.
-- Existing rooms keep their current setting unchanged.

ALTER TABLE "rooms" ALTER COLUMN "applyForMic" SET DEFAULT false;
