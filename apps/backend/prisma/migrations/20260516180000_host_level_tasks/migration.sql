-- Replace legacy host_tasks with New Level Task tables

DROP TABLE IF EXISTS "host_tasks";
DROP TABLE IF EXISTS "host_task_definitions";

CREATE TABLE "host_level_task_tiers" (
    "id" TEXT NOT NULL,
    "levelCode" TEXT NOT NULL,
    "minSevenDayEarnings" BIGINT NOT NULL,
    "dailyTaskRewardBeans" INTEGER NOT NULL,
    "incomeTaskHourlyBeans" INTEGER NOT NULL DEFAULT 10000,
    "incomeTaskMaxHoursPerDay" INTEGER NOT NULL DEFAULT 3,
    "hourlyMaxBeans" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_level_task_tiers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "host_level_task_tiers_levelCode_key" ON "host_level_task_tiers"("levelCode");

CREATE TABLE "host_level_task_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "ordinaryMaxSevenDayEarnings" BIGINT NOT NULL DEFAULT 1200000,
    "newHostProtectionDays" INTEGER NOT NULL DEFAULT 7,
    "newHostHourlyBeans" INTEGER NOT NULL DEFAULT 4000,
    "newHostHoursPerDay" INTEGER NOT NULL DEFAULT 3,
    "newHostTotalCapBeans" INTEGER NOT NULL DEFAULT 84000,
    "ordinaryLiveHourlyBeans" INTEGER NOT NULL DEFAULT 2000,
    "ordinaryLiveHoursPerDay" INTEGER NOT NULL DEFAULT 1,
    "ordinaryIncomeHourlyBeans" INTEGER NOT NULL DEFAULT 10000,
    "ordinaryIncomeHoursPerDay" INTEGER NOT NULL DEFAULT 3,
    "ordinaryHourlyMaxBeans" INTEGER NOT NULL DEFAULT 12000,
    "ordinaryDailyMaxBeans" INTEGER NOT NULL DEFAULT 32000,
    "incomeTaskThresholdBeans" INTEGER NOT NULL DEFAULT 50000,
    "liveClaimChunkMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_level_task_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "host_level_task_daily" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskDate" DATE NOT NULL,
    "track" TEXT NOT NULL,
    "levelCode" TEXT NOT NULL DEFAULT '',
    "liveMinutesClaimed" INTEGER NOT NULL DEFAULT 0,
    "liveBeansClaimed" INTEGER NOT NULL DEFAULT 0,
    "incomeClaimsCount" INTEGER NOT NULL DEFAULT 0,
    "incomeBeansClaimed" INTEGER NOT NULL DEFAULT 0,
    "totalBeansClaimed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_level_task_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "host_level_task_daily_userId_taskDate_key" ON "host_level_task_daily"("userId", "taskDate");
CREATE INDEX "host_level_task_daily_userId_taskDate_idx" ON "host_level_task_daily"("userId", "taskDate");

ALTER TABLE "host_level_task_daily" ADD CONSTRAINT "host_level_task_daily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Default settings
INSERT INTO "host_level_task_settings" ("id", "updatedAt") VALUES ('singleton', CURRENT_TIMESTAMP);

-- Level tiers S–E
INSERT INTO "host_level_task_tiers" ("id", "levelCode", "minSevenDayEarnings", "dailyTaskRewardBeans", "hourlyMaxBeans", "sortOrder", "updatedAt") VALUES
    ('a1000001-0001-4000-8000-000000000001', 'S', 50000000, 200000, 210000, 1, CURRENT_TIMESTAMP),
    ('a1000001-0001-4000-8000-000000000002', 'A', 22000000, 100000, 110000, 2, CURRENT_TIMESTAMP),
    ('a1000001-0001-4000-8000-000000000003', 'B', 10000000, 80000, 90000, 3, CURRENT_TIMESTAMP),
    ('a1000001-0001-4000-8000-000000000004', 'C', 7000000, 50000, 60000, 4, CURRENT_TIMESTAMP),
    ('a1000001-0001-4000-8000-000000000005', 'D', 4000000, 30000, 40000, 5, CURRENT_TIMESTAMP),
    ('a1000001-0001-4000-8000-000000000006', 'E', 2000000, 10000, 20000, 6, CURRENT_TIMESTAMP);
