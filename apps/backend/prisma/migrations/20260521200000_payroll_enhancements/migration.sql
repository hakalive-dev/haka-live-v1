-- AlterTable
ALTER TABLE "withdrawal_requests" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "disputeReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "disputedAt" TIMESTAMP(3),
ADD COLUMN     "disputedByUserId" TEXT,
ADD COLUMN     "ipAddress" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ipRiskFlagged" BOOLEAN NOT NULL DEFAULT false;
