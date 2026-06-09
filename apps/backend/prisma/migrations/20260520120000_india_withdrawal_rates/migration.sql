-- India: min withdrawal 100,000 beans; 1 USD = 92 INR (manual rate)
UPDATE "currency_rates"
SET
  "usdRate" = 92,
  "minWithdrawalBeans" = 100000,
  "source" = 'manual',
  "updatedAt" = NOW()
WHERE "countryCode" = 'IN';
