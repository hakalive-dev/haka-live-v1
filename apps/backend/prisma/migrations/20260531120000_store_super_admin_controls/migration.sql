-- Store super-admin controls: sale status, schedules, distribution logs

ALTER TABLE "store_items" ADD COLUMN "isForSale" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "store_items_isActive_isForSale_idx" ON "store_items"("isActive", "isForSale");

CREATE TABLE "store_item_sale_status_logs" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "previousForSale" BOOLEAN NOT NULL,
    "newForSale" BOOLEAN NOT NULL,
    "adminId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "scheduleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_item_sale_status_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "store_item_sale_schedules" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "targetForSale" BOOLEAN NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdByAdminId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_item_sale_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "store_item_distributions" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL DEFAULT '',
    "adminId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'single',
    "audienceType" TEXT NOT NULL DEFAULT 'user_ids',
    "audienceMeta" JSONB,
    "coinValueSnapshot" INTEGER NOT NULL DEFAULT 0,
    "bulkJobId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_item_distributions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "store_item_sale_status_logs_itemId_createdAt_idx" ON "store_item_sale_status_logs"("itemId", "createdAt");

CREATE INDEX "store_item_sale_schedules_status_effectiveAt_idx" ON "store_item_sale_schedules"("status", "effectiveAt");
CREATE INDEX "store_item_sale_schedules_itemId_idx" ON "store_item_sale_schedules"("itemId");

CREATE INDEX "store_item_distributions_itemId_createdAt_idx" ON "store_item_distributions"("itemId", "createdAt");
CREATE INDEX "store_item_distributions_recipientUserId_createdAt_idx" ON "store_item_distributions"("recipientUserId", "createdAt");
CREATE INDEX "store_item_distributions_adminId_createdAt_idx" ON "store_item_distributions"("adminId", "createdAt");
CREATE INDEX "store_item_distributions_bulkJobId_idx" ON "store_item_distributions"("bulkJobId");

ALTER TABLE "store_item_sale_status_logs" ADD CONSTRAINT "store_item_sale_status_logs_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "store_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_item_sale_schedules" ADD CONSTRAINT "store_item_sale_schedules_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "store_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_item_distributions" ADD CONSTRAINT "store_item_distributions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "store_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_item_distributions" ADD CONSTRAINT "store_item_distributions_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
