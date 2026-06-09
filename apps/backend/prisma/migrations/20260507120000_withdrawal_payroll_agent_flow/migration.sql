-- AlterTable
ALTER TABLE "withdrawal_requests" ADD COLUMN "assignedAgentId" TEXT,
ADD COLUMN "assignedAt" TIMESTAMP(3),
ADD COLUMN "assignedByAdminId" TEXT,
ADD COLUMN "proofUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN "proofUploadedAt" TIMESTAMP(3),
ADD COLUMN "agentProofNotes" TEXT NOT NULL DEFAULT '',
ADD COLUMN "verifiedByAdminId" TEXT,
ADD COLUMN "verifiedAt" TIMESTAMP(3),
ADD COLUMN "adminRejectionNotes" TEXT NOT NULL DEFAULT '';

-- Migrate legacy pending rows to the new workflow state
UPDATE "withdrawal_requests" SET "status" = 'pending_review' WHERE "status" = 'pending';

-- New requests use pending_review by default (Prisma @default)
ALTER TABLE "withdrawal_requests" ALTER COLUMN "status" SET DEFAULT 'pending_review';

-- CreateIndex
CREATE INDEX "withdrawal_requests_assignedAgentId_idx" ON "withdrawal_requests"("assignedAgentId");

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
