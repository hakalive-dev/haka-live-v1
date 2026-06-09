-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "applyForMic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fanBadge" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "gameType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "room_admins" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_admins_roomId_userId_key" ON "room_admins"("roomId", "userId");

-- AddForeignKey
ALTER TABLE "room_admins" ADD CONSTRAINT "room_admins_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_admins" ADD CONSTRAINT "room_admins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
