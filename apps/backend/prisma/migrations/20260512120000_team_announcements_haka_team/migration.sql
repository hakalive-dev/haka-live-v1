-- AlterTable
ALTER TABLE "users" ADD COLUMN     "profileHidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "team_announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_announcement_reads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_announcement_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_announcements_publishedAt_idx" ON "team_announcements"("publishedAt");

-- CreateIndex
CREATE INDEX "team_announcement_reads_userId_idx" ON "team_announcement_reads"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "team_announcement_reads_userId_announcementId_key" ON "team_announcement_reads"("userId", "announcementId");

-- AddForeignKey
ALTER TABLE "team_announcements" ADD CONSTRAINT "team_announcements_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_announcement_reads" ADD CONSTRAINT "team_announcement_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_announcement_reads" ADD CONSTRAINT "team_announcement_reads_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "team_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
