-- AlterTable
ALTER TABLE "direct_messages" ADD COLUMN     "giftCoinCost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "giftIcon" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "giftId" TEXT,
ADD COLUMN     "giftImage" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "giftName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "giftQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "messageType" TEXT NOT NULL DEFAULT 'text';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);
