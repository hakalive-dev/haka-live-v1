-- Country-scoped admin withdrawal freezes.
CREATE TABLE "admin_withdrawal_freezes" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "isFrozen" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_withdrawal_freezes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_withdrawal_freezes_countryCode_key" ON "admin_withdrawal_freezes" ("countryCode");
CREATE INDEX "admin_withdrawal_freezes_adminId_idx" ON "admin_withdrawal_freezes" ("adminId");

ALTER TABLE "admin_withdrawal_freezes"
ADD CONSTRAINT "admin_withdrawal_freezes_adminId_fkey"
FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

