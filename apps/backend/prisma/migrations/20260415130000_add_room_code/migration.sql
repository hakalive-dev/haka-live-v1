ALTER TABLE "rooms" ADD COLUMN "roomCode" TEXT;
CREATE UNIQUE INDEX "rooms_roomCode_key" ON "rooms"("roomCode");
