-- CreateTable
CREATE TABLE "agency_learn_promotions" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "linkUrl" TEXT NOT NULL DEFAULT '',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "tag" TEXT NOT NULL DEFAULT 'Original',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_learn_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agency_learn_promotions_isActive_sortOrder_idx" ON "agency_learn_promotions"("isActive", "sortOrder");
