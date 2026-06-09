-- CreateTable
CREATE TABLE "device_bans" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "banType" TEXT NOT NULL DEFAULT 'permanent',
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_bans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_bans_deviceId_isActive_idx" ON "device_bans"("deviceId", "isActive");
