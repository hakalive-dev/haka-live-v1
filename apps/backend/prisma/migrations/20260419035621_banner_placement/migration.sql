-- AlterTable
ALTER TABLE "banners" ADD COLUMN     "placement" TEXT NOT NULL DEFAULT 'home_top';

-- CreateIndex
CREATE INDEX "banners_placement_isActive_idx" ON "banners"("placement", "isActive");
