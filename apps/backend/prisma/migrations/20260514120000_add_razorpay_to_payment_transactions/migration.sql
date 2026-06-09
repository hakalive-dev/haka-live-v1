-- AlterTable: make stripePaymentIntentId nullable, add Razorpay fields
ALTER TABLE "payment_transactions" ALTER COLUMN "stripePaymentIntentId" DROP NOT NULL;

-- AddColumn: razorpayOrderId (nullable, unique)
ALTER TABLE "payment_transactions" ADD COLUMN "razorpayOrderId" TEXT;

-- CreateIndex: unique on razorpayOrderId
CREATE UNIQUE INDEX "payment_transactions_razorpayOrderId_key" ON "payment_transactions"("razorpayOrderId");

-- AddColumn: razorpayPaymentId (nullable)
ALTER TABLE "payment_transactions" ADD COLUMN "razorpayPaymentId" TEXT;
