-- Lucky Gifts: on by default (new installs + existing singleton row).

ALTER TABLE "lucky_gift_settings" ALTER COLUMN "enabled" SET DEFAULT true;

UPDATE "lucky_gift_settings" SET "enabled" = true WHERE "id" = 'singleton';
