-- Align denormalized totalCustomers with distinct retail buyers (user-target transfers, excluding self).
UPDATE coin_seller_profiles p
SET "totalCustomers" = (
  SELECT COUNT(DISTINCT t."counterpartyId")::int
  FROM coin_seller_transactions t
  WHERE t."sellerId" = p."userId"
    AND t."transactionType" = 'transfer'
    AND t."targetType" = 'user'
    AND t."counterpartyId" IS NOT NULL
    AND t."counterpartyId" <> p."userId"
);
