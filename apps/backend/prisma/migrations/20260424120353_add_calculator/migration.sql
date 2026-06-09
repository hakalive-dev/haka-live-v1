-- CreateTable
CREATE TABLE "CalculatorSession" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "durationSeconds" INTEGER,
    "endsAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalculatorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalculatorSeatScore" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seatPosition" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalculatorSeatScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalculatorSession_roomId_status_idx" ON "CalculatorSession"("roomId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CalculatorSeatScore_sessionId_userId_key" ON "CalculatorSeatScore"("sessionId", "userId");

-- AddForeignKey
ALTER TABLE "CalculatorSession" ADD CONSTRAINT "CalculatorSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculatorSeatScore" ADD CONSTRAINT "CalculatorSeatScore_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CalculatorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculatorSeatScore" ADD CONSTRAINT "CalculatorSeatScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
