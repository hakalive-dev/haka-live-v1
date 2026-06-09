-- AlterTable: promote all coin/bean balance and amount columns to bigint
-- to prevent 32-bit integer overflow on high-volume accounts.

ALTER TABLE "wallets"
  ALTER COLUMN "coinBalance" TYPE BIGINT,
  ALTER COLUMN "beanBalance" TYPE BIGINT;

ALTER TABLE "wallet_transactions"
  ALTER COLUMN "amount" TYPE BIGINT,
  ALTER COLUMN "balanceAfter" TYPE BIGINT;

ALTER TABLE "withdrawal_requests"
  ALTER COLUMN "beansAmount" TYPE BIGINT;

ALTER TABLE "agent_transactions"
  ALTER COLUMN "coinsSold" TYPE BIGINT;

ALTER TABLE "coin_seller_profiles"
  ALTER COLUMN "availableBalance" TYPE BIGINT,
  ALTER COLUMN "totalBalance" TYPE BIGINT,
  ALTER COLUMN "securityDeposit" TYPE BIGINT,
  ALTER COLUMN "totalCoinsSold" TYPE BIGINT;

ALTER TABLE "coin_seller_transactions"
  ALTER COLUMN "coinsAmount" TYPE BIGINT;

ALTER TABLE "seller_recharge_requests"
  ALTER COLUMN "coinsToCredit" TYPE BIGINT;
