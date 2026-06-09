-- CreateTable
CREATE TABLE "account_risks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "freezeCoins" BOOLEAN NOT NULL DEFAULT false,
    "freezeBeans" BOOLEAN NOT NULL DEFAULT false,
    "disableGames" BOOLEAN NOT NULL DEFAULT false,
    "disableGifts" BOOLEAN NOT NULL DEFAULT false,
    "blockChat" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "notes" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "releasedAt" TIMESTAMP(3),
    "releasedBy" TEXT NOT NULL DEFAULT '',
    "appliedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_risks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_risks_userId_isActive_idx" ON "account_risks"("userId", "isActive");

-- CreateIndex
CREATE INDEX "account_risks_isActive_severity_idx" ON "account_risks"("isActive", "severity");

-- AddForeignKey
ALTER TABLE "account_risks" ADD CONSTRAINT "account_risks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
