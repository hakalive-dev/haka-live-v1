-- CreateTable
CREATE TABLE "admin_custom_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#7B4FFF',
    "permissions" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_custom_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "bannerUrl" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "entryRequirement" TEXT NOT NULL DEFAULT 'free',
    "entryCost" INTEGER NOT NULL DEFAULT 0,
    "participationType" TEXT NOT NULL DEFAULT 'solo',
    "scoringSystem" TEXT NOT NULL DEFAULT 'gifts_received',
    "rankingPeriod" TEXT NOT NULL DEFAULT 'global',
    "visibility" JSONB NOT NULL DEFAULT '{"homePage":true,"bannerSlider":false,"pushNotification":false}',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_rewards" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "rewardType" TEXT NOT NULL,
    "rewardLabel" TEXT NOT NULL DEFAULT '',
    "rewardAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "redirectType" TEXT NOT NULL,
    "redirectValue" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_custom_roles_name_key" ON "admin_custom_roles"("name");

-- CreateIndex
CREATE INDEX "events_status_startDate_idx" ON "events"("status", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "event_rewards_eventId_rank_key" ON "event_rewards"("eventId", "rank");

-- CreateIndex
CREATE INDEX "banners_isActive_priority_idx" ON "banners"("isActive", "priority");

-- AddForeignKey
ALTER TABLE "event_rewards" ADD CONSTRAINT "event_rewards_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
