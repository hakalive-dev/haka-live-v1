-- Refresh-token rotation grace window.
-- Old tokens are marked rotated (not deleted) so concurrent/retried refreshes
-- can converge on the successor instead of one of them failing with 401.
ALTER TABLE "refresh_tokens" ADD COLUMN "rotatedAt" TIMESTAMP(3);
ALTER TABLE "refresh_tokens" ADD COLUMN "replacedByToken" TEXT;

CREATE INDEX "refresh_tokens_userId_rotatedAt_idx" ON "refresh_tokens"("userId", "rotatedAt");
