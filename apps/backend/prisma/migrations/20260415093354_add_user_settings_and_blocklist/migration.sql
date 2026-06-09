-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "liveRoomAlerts" BOOLEAN NOT NULL DEFAULT true,
    "messageNotifications" BOOLEAN NOT NULL DEFAULT true,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "vibrateEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whoCanMessage" TEXT NOT NULL DEFAULT 'everyone',
    "cameraAccess" BOOLEAN NOT NULL DEFAULT false,
    "voiceAccess" BOOLEAN NOT NULL DEFAULT false,
    "locationAccess" BOOLEAN NOT NULL DEFAULT false,
    "invisibleVisitor" BOOLEAN NOT NULL DEFAULT false,
    "mysteryManLive" BOOLEAN NOT NULL DEFAULT false,
    "mysteryManRank" BOOLEAN NOT NULL DEFAULT false,
    "invisibleOnline" BOOLEAN NOT NULL DEFAULT false,
    "exclusiveEmailNotification" BOOLEAN NOT NULL DEFAULT false,
    "hideLivestreamLevel" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT '',
    "useSystemLanguage" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_users" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");

-- CreateIndex
CREATE INDEX "blocked_users_actorId_createdAt_idx" ON "blocked_users"("actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_users_actorId_targetId_key" ON "blocked_users"("actorId", "targetId");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
