-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "bgMusicUrl" TEXT,
ADD COLUMN     "hdMicEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicMsgEnabled" BOOLEAN NOT NULL DEFAULT true;
