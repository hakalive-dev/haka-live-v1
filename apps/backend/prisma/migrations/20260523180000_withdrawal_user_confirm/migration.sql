-- AlterTable
ALTER TABLE "withdrawal_requests" ADD COLUMN     "userConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "userConfirmAutoAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_proofUploadedAt_idx" ON "withdrawal_requests"("status", "proofUploadedAt");
