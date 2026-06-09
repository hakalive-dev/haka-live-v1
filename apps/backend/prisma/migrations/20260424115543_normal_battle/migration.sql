-- CreateTable
CREATE TABLE "normal_battles" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "participantAId" TEXT NOT NULL,
    "participantBId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "winnerId" TEXT,
    "scoreA" INTEGER NOT NULL DEFAULT 0,
    "scoreB" INTEGER NOT NULL DEFAULT 0,
    "durationSecs" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "normal_battles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "normal_battles_roomId_status_idx" ON "normal_battles"("roomId", "status");
