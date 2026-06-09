-- AlterTable
ALTER TABLE "room_messages" ADD COLUMN     "mediaUrl" TEXT,
ALTER COLUMN "content" DROP NOT NULL;
