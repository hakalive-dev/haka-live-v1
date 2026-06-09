-- CreateTable
CREATE TABLE "seller_exchange_requests" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "pointsAmount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNotes" TEXT NOT NULL DEFAULT '',
    "processedAt" TIMESTAMP(3),
    "processedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_exchange_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seller_exchange_requests_sellerId_status_idx" ON "seller_exchange_requests"("sellerId", "status");

-- AddForeignKey
ALTER TABLE "seller_exchange_requests" ADD CONSTRAINT "seller_exchange_requests_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
