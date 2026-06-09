-- CreateTable
CREATE TABLE "payroll_records" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "amountBeans" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT NOT NULL DEFAULT '',
    "paidAt" TIMESTAMP(3),
    "paidByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_records_recipientId_idx" ON "payroll_records"("recipientId");

-- CreateIndex
CREATE INDEX "payroll_records_status_idx" ON "payroll_records"("status");

-- AddForeignKey
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
