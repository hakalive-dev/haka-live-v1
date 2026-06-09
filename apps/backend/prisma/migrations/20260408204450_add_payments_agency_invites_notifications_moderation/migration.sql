-- AlterTable
ALTER TABLE "users" ADD COLUMN     "fcmToken" TEXT;

-- CreateTable
CREATE TABLE "coin_packages" (
    "id" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "bonusCoins" INTEGER NOT NULL DEFAULT 0,
    "priceGbp" DECIMAL(65,30) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coin_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL,
    "amountGbp" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "coinsCredited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_transactions" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "coinsSold" INTEGER NOT NULL,
    "amountCollected" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_tiers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minWeeklyBeans" INTEGER NOT NULL,
    "commissionRate" DECIMAL(65,30) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "host_task_definitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "taskType" TEXT NOT NULL,
    "unlockAfterDays" INTEGER NOT NULL DEFAULT 0,
    "targetValue" INTEGER NOT NULL,
    "rewardBeans" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_task_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "host_tasks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "host_applications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "path" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT NOT NULL DEFAULT '',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_codes" (
    "id" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "inviteeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rewardClaimed" BOOLEAN NOT NULL DEFAULT false,
    "rewardCoins" INTEGER NOT NULL DEFAULT 100,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "banType" TEXT NOT NULL DEFAULT 'permanent',
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_stripePaymentIntentId_key" ON "payment_transactions"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "payment_transactions_userId_createdAt_idx" ON "payment_transactions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_transactions_agentId_createdAt_idx" ON "agent_transactions"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "host_tasks_userId_definitionId_key" ON "host_tasks"("userId", "definitionId");

-- CreateIndex
CREATE INDEX "host_applications_userId_createdAt_idx" ON "host_applications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "host_applications_agentId_createdAt_idx" ON "host_applications"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_inviteeId_key" ON "invite_codes"("inviteeId");

-- CreateIndex
CREATE INDEX "invite_codes_inviterId_createdAt_idx" ON "invite_codes"("inviterId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "reports_reporterId_createdAt_idx" ON "reports"("reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "reports_targetType_targetId_idx" ON "reports"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "bans_userId_isActive_idx" ON "bans"("userId", "isActive");

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "coin_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_transactions" ADD CONSTRAINT "agent_transactions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_transactions" ADD CONSTRAINT "agent_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_tasks" ADD CONSTRAINT "host_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_tasks" ADD CONSTRAINT "host_tasks_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "host_task_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_applications" ADD CONSTRAINT "host_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_applications" ADD CONSTRAINT "host_applications_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bans" ADD CONSTRAINT "bans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
