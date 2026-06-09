-- CreateTable
CREATE TABLE "admin_notifications" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "linkPath" TEXT NOT NULL DEFAULT '',
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_notifications_createdAt_idx" ON "admin_notifications"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "admin_notifications_readAt_idx" ON "admin_notifications"("readAt");

-- CreateIndex
CREATE INDEX "admin_notifications_type_entityId_idx" ON "admin_notifications"("type", "entityId");
