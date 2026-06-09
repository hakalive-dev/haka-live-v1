-- DropForeignKey
ALTER TABLE "gift_commission_ledger" DROP CONSTRAINT IF EXISTS "gift_commission_ledger_agencyId_fkey";

-- AlterTable (split so each clause can be guarded independently)
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "theme";
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "themeId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "themes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gradientFrom" TEXT NOT NULL DEFAULT '#1E1A3C',
    "gradientTo" TEXT NOT NULL DEFAULT '#2A2550',
    "backgroundImageUrl" TEXT,
    "svgaUrl" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#7c3aed',
    "chatBubbleColor" TEXT NOT NULL DEFAULT '#2A2550',
    "storeItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "themes_storeItemId_key" ON "themes"("storeItemId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "rooms_themeId_idx" ON "rooms"("themeId");

-- AddForeignKey (rooms -> themes)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_themeId_fkey') THEN
    ALTER TABLE "rooms" ADD CONSTRAINT "rooms_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (gift_commission_ledger -> agencies)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_commission_ledger_agencyId_fkey') THEN
    ALTER TABLE "gift_commission_ledger" ADD CONSTRAINT "gift_commission_ledger_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (themes -> store_items)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'themes_storeItemId_fkey') THEN
    ALTER TABLE "themes" ADD CONSTRAINT "themes_storeItemId_fkey" FOREIGN KEY ("storeItemId") REFERENCES "store_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
