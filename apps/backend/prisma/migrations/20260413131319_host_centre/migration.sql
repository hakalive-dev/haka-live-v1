-- CreateTable
CREATE TABLE "host_tiers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hourlyRateBeans" INTEGER NOT NULL,
    "minWeeklyBeans" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "host_mic_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "beansAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_mic_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_change_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromAgentId" TEXT,
    "toAgentId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "host_tiers_name_key" ON "host_tiers"("name");

-- CreateIndex
CREATE INDEX "host_mic_sessions_userId_startedAt_idx" ON "host_mic_sessions"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "host_mic_sessions_userId_endedAt_idx" ON "host_mic_sessions"("userId", "endedAt");

-- CreateIndex
CREATE INDEX "agency_change_requests_userId_status_idx" ON "agency_change_requests"("userId", "status");

-- AddForeignKey
ALTER TABLE "host_mic_sessions" ADD CONSTRAINT "host_mic_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_change_requests" ADD CONSTRAINT "agency_change_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
