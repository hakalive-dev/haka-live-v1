-- Per-recipient calculator supporter tracking (session-scoped rows are ephemeral).
DELETE FROM "calculator_gift_contributions";

DROP INDEX IF EXISTS "calculator_gift_contributions_sessionId_senderId_key";

ALTER TABLE "calculator_gift_contributions" ADD COLUMN "recipientId" TEXT NOT NULL;

CREATE INDEX "calculator_gift_contributions_sessionId_recipientId_idx"
  ON "calculator_gift_contributions"("sessionId", "recipientId");

CREATE UNIQUE INDEX "calculator_gift_contributions_sessionId_senderId_recipientId_key"
  ON "calculator_gift_contributions"("sessionId", "senderId", "recipientId");

ALTER TABLE "calculator_gift_contributions"
  ADD CONSTRAINT "calculator_gift_contributions_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
