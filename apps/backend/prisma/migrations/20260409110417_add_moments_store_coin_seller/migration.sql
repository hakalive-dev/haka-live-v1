-- CreateTable
CREATE TABLE "moments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postType" TEXT NOT NULL DEFAULT 'moment',
    "mediaUrl" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "hashtag" TEXT NOT NULL DEFAULT '',
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "sharesCount" INTEGER NOT NULL DEFAULT 0,
    "giftsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moment_likes" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moment_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moment_comments" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moment_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "image" TEXT,
    "previewImage" TEXT,
    "category" TEXT NOT NULL,
    "coinCost" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_store_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "isEquipped" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_store_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_seller_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL DEFAULT '',
    "isAssistant" BOOLEAN NOT NULL DEFAULT false,
    "totalCommissionRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "giftCommissionRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "incomeRewardRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "giftBonusRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "levelUpRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "availableBalance" INTEGER NOT NULL DEFAULT 0,
    "totalBalance" INTEGER NOT NULL DEFAULT 0,
    "securityDeposit" INTEGER NOT NULL DEFAULT 0,
    "sellerLevel" TEXT NOT NULL DEFAULT 'Bronze',
    "quickMessage" TEXT NOT NULL DEFAULT '',
    "totalCoinsSold" INTEGER NOT NULL DEFAULT 0,
    "totalCustomers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coin_seller_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_seller_transactions" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "counterpartyId" TEXT,
    "transactionType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT '',
    "coinsAmount" INTEGER NOT NULL,
    "operatorName" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coin_seller_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_seller_level_rules" (
    "id" TEXT NOT NULL,
    "levelName" TEXT NOT NULL,
    "exchangeLimit" TEXT NOT NULL DEFAULT '',
    "sellerToUserRate" TEXT NOT NULL DEFAULT '',
    "userToSellerRate" TEXT NOT NULL DEFAULT '',
    "sellerListRule" TEXT NOT NULL DEFAULT '',
    "coinSellingListRule" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coin_seller_level_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moments_userId_createdAt_idx" ON "moments"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "moments_postType_createdAt_idx" ON "moments"("postType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "moment_likes_momentId_userId_key" ON "moment_likes"("momentId", "userId");

-- CreateIndex
CREATE INDEX "moment_comments_momentId_createdAt_idx" ON "moment_comments"("momentId", "createdAt");

-- CreateIndex
CREATE INDEX "store_items_category_sortOrder_idx" ON "store_items"("category", "sortOrder");

-- CreateIndex
CREATE INDEX "user_store_items_userId_itemId_idx" ON "user_store_items"("userId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "coin_seller_profiles_userId_key" ON "coin_seller_profiles"("userId");

-- CreateIndex
CREATE INDEX "coin_seller_transactions_sellerId_createdAt_idx" ON "coin_seller_transactions"("sellerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "coin_seller_level_rules_levelName_key" ON "coin_seller_level_rules"("levelName");

-- AddForeignKey
ALTER TABLE "moments" ADD CONSTRAINT "moments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_likes" ADD CONSTRAINT "moment_likes_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_likes" ADD CONSTRAINT "moment_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_comments" ADD CONSTRAINT "moment_comments_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_comments" ADD CONSTRAINT "moment_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_store_items" ADD CONSTRAINT "user_store_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_store_items" ADD CONSTRAINT "user_store_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "store_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_seller_profiles" ADD CONSTRAINT "coin_seller_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_seller_transactions" ADD CONSTRAINT "coin_seller_transactions_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_seller_transactions" ADD CONSTRAINT "coin_seller_transactions_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
