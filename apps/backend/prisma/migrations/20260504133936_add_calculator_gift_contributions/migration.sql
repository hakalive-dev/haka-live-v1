-- AlterTable
ALTER TABLE "agent_applications" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "calculator_gift_contributions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calculator_gift_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calculator_gift_contributions_sessionId_idx" ON "calculator_gift_contributions"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "calculator_gift_contributions_sessionId_senderId_key" ON "calculator_gift_contributions"("sessionId", "senderId");

-- AddForeignKey
ALTER TABLE "calculator_gift_contributions" ADD CONSTRAINT "calculator_gift_contributions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "calculator_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculator_gift_contributions" ADD CONSTRAINT "calculator_gift_contributions_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
