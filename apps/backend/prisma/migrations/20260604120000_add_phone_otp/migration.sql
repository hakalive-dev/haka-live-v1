-- CreateTable
CREATE TABLE "phone_otps" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phone_otps_phone_createdAt_idx" ON "phone_otps"("phone", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "phone_otps_expiresAt_idx" ON "phone_otps"("expiresAt");
