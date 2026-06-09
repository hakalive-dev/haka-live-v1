-- CreateTable
CREATE TABLE "user_payment_methods" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "methodType" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "nickname" TEXT NOT NULL DEFAULT '',
    "bankAccountNo" TEXT,
    "bankName" TEXT,
    "ifscCode" TEXT,
    "accountHolderName" TEXT,
    "countryName" TEXT,
    "epayAccount" TEXT,
    "bep20Address" TEXT,
    "trc20Address" TEXT,
    "maskedAccount" TEXT NOT NULL DEFAULT '',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_payment_methods_userId_idx" ON "user_payment_methods"("userId");

-- AddForeignKey
ALTER TABLE "user_payment_methods" ADD CONSTRAINT "user_payment_methods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
