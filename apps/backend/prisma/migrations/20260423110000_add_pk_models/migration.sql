-- CreateTable
CREATE TABLE "pk_matches" (
    "id" TEXT NOT NULL,
    "roomAId" TEXT NOT NULL,
    "roomBId" TEXT NOT NULL,
    "hostAId" TEXT NOT NULL,
    "hostBId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "winnerId" TEXT,
    "scoreA" INTEGER NOT NULL DEFAULT 0,
    "scoreB" INTEGER NOT NULL DEFAULT 0,
    "durationSecs" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pk_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pk_invites" (
    "id" TEXT NOT NULL,
    "matchId" TEXT,
    "fromRoomId" TEXT NOT NULL,
    "toRoomId" TEXT NOT NULL,
    "fromHostId" TEXT NOT NULL,
    "toHostId" TEXT NOT NULL,
    "durationSecs" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pk_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pk_matches_roomAId_status_idx" ON "pk_matches"("roomAId", "status");

-- CreateIndex
CREATE INDEX "pk_matches_roomBId_status_idx" ON "pk_matches"("roomBId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pk_invites_matchId_key" ON "pk_invites"("matchId");

-- CreateIndex
CREATE INDEX "pk_invites_toHostId_status_idx" ON "pk_invites"("toHostId", "status");
