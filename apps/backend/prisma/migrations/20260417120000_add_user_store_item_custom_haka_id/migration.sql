-- AlterTable
ALTER TABLE "user_store_items" ADD COLUMN "customHakaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_store_items_customHakaId_key" ON "user_store_items"("customHakaId");
