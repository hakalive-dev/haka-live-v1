-- PayrollAgentProfile + PayrollLedgerEntry + WithdrawalRequest payout fields

CREATE TABLE "payroll_agent_profiles" (
    "userId" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "acceptingOrders" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_agent_profiles_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "payroll_agent_profiles_payrollId_key" ON "payroll_agent_profiles"("payrollId");
CREATE INDEX "payroll_agent_profiles_countryCode_status_idx" ON "payroll_agent_profiles"("countryCode", "status");

ALTER TABLE "payroll_agent_profiles" ADD CONSTRAINT "payroll_agent_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payroll_ledger_entries" (
    "id" TEXT NOT NULL,
    "agentUserId" TEXT NOT NULL,
    "withdrawalRequestId" TEXT NOT NULL,
    "beansAmount" BIGINT NOT NULL,
    "commissionBeans" BIGINT NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_ledger_entries_withdrawalRequestId_key" ON "payroll_ledger_entries"("withdrawalRequestId");
CREATE INDEX "payroll_ledger_entries_agentUserId_createdAt_idx" ON "payroll_ledger_entries"("agentUserId", "createdAt");

ALTER TABLE "payroll_ledger_entries" ADD CONSTRAINT "payroll_ledger_entries_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_ledger_entries" ADD CONSTRAINT "payroll_ledger_entries_withdrawalRequestId_fkey" FOREIGN KEY ("withdrawalRequestId") REFERENCES "withdrawal_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "withdrawal_requests" ADD COLUMN "paymentMethodId" TEXT,
ADD COLUMN "payoutSnapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN "externalTransactionId" TEXT NOT NULL DEFAULT '',
ADD COLUMN "proofContentHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN "escalatedAt" TIMESTAMP(3),
ADD COLUMN "frozenByAdminId" TEXT;

CREATE INDEX "withdrawal_requests_countryCode_status_idx" ON "withdrawal_requests"("countryCode", "status");
CREATE INDEX "withdrawal_requests_proofContentHash_idx" ON "withdrawal_requests"("proofContentHash");

ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "user_payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
