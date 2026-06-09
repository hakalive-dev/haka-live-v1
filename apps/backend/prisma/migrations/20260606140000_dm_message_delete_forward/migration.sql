-- AlterTable
ALTER TABLE "direct_messages" ADD COLUMN "deletedForAllAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "direct_message_hidden" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direct_message_hidden_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "direct_message_hidden_userId_idx" ON "direct_message_hidden"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "direct_message_hidden_messageId_userId_key" ON "direct_message_hidden"("messageId", "userId");

-- AddForeignKey
ALTER TABLE "direct_message_hidden" ADD CONSTRAINT "direct_message_hidden_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "direct_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_message_hidden" ADD CONSTRAINT "direct_message_hidden_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
