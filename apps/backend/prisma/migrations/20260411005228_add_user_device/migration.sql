-- CreateTable
CREATE TABLE "user_devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceModel" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL DEFAULT '',
    "appVersion" TEXT NOT NULL DEFAULT '',
    "lastLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_devices_deviceId_idx" ON "user_devices"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_userId_deviceId_key" ON "user_devices"("userId", "deviceId");

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
