-- AlterTable
ALTER TABLE "bans" ADD COLUMN     "bannedBy" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "roomId" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'platform';

-- CreateTable
CREATE TABLE "admin_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#7B4FFF',
    "iconUrl" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tags" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_tags_name_key" ON "admin_tags"("name");

-- CreateIndex
CREATE INDEX "user_tags_tagId_idx" ON "user_tags"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "user_tags_userId_tagId_key" ON "user_tags"("userId", "tagId");

-- CreateIndex
CREATE INDEX "bans_roomId_isActive_idx" ON "bans"("roomId", "isActive");

-- AddForeignKey
ALTER TABLE "user_tags" ADD CONSTRAINT "user_tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tags" ADD CONSTRAINT "user_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "admin_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
