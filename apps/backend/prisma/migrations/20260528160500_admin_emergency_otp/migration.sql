-- Emergency one-time OTP codes for admin staff login.
CREATE TABLE "admin_emergency_otps" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_emergency_otps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_emergency_otps_adminId_createdAt_idx" ON "admin_emergency_otps" ("adminId", "createdAt" DESC);
CREATE INDEX "admin_emergency_otps_expiresAt_idx" ON "admin_emergency_otps" ("expiresAt");

ALTER TABLE "admin_emergency_otps"
ADD CONSTRAINT "admin_emergency_otps_adminId_fkey"
FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

