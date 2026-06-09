/*
  Warnings:

  - You are about to drop the `CalculatorSeatScore` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CalculatorSession` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CalculatorSeatScore" DROP CONSTRAINT "CalculatorSeatScore_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "CalculatorSeatScore" DROP CONSTRAINT "CalculatorSeatScore_userId_fkey";

-- DropForeignKey
ALTER TABLE "CalculatorSession" DROP CONSTRAINT "CalculatorSession_roomId_fkey";

-- DropTable
DROP TABLE "CalculatorSeatScore";

-- DropTable
DROP TABLE "CalculatorSession";

-- CreateTable
CREATE TABLE "calculator_sessions" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "durationSeconds" INTEGER,
    "endsAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calculator_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculator_seat_scores" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seatPosition" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calculator_seat_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calculator_sessions_roomId_status_idx" ON "calculator_sessions"("roomId", "status");

-- CreateIndex
CREATE INDEX "calculator_seat_scores_userId_idx" ON "calculator_seat_scores"("userId");

-- CreateIndex
CREATE INDEX "calculator_seat_scores_roomId_idx" ON "calculator_seat_scores"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "calculator_seat_scores_sessionId_userId_key" ON "calculator_seat_scores"("sessionId", "userId");

-- AddForeignKey
ALTER TABLE "calculator_sessions" ADD CONSTRAINT "calculator_sessions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculator_seat_scores" ADD CONSTRAINT "calculator_seat_scores_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "calculator_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculator_seat_scores" ADD CONSTRAINT "calculator_seat_scores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
