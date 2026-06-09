-- AlterTable
ALTER TABLE "user_payment_methods" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "user_payment_methods" ADD COLUMN "provider" TEXT NOT NULL DEFAULT '';
ALTER TABLE "user_payment_methods" ADD COLUMN "accountLabel" TEXT NOT NULL DEFAULT '';

-- Deactivate withdrawal countries not on the allowed list
UPDATE "currency_rates" SET "isActive" = false
WHERE "countryCode" NOT IN ('IN', 'KE', 'NP', 'NG', 'PK', 'PH', 'ZA', 'VN', 'BD', 'US', 'ET', 'GH', 'IT');

-- Ensure the 13 withdrawal countries exist and are active (rates are approximate seeds)
INSERT INTO "currency_rates" ("id", "countryCode", "countryName", "currency", "symbol", "usdRate", "minWithdrawalBeans", "displayOrder", "isActive", "source", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'IN', 'India', 'INR', '₹', 83, 10000, 0, true, 'manual', NOW(), NOW()),
  (gen_random_uuid(), 'KE', 'Kenya', 'KES', 'KSh', 129, 10000, 0, true, 'manual', NOW(), NOW()),
  (gen_random_uuid(), 'NP', 'Nepal', 'NPR', 'Rs', 133, 10000, 0, true, 'manual', NOW(), NOW()),
  (gen_random_uuid(), 'NG', 'Nigeria', 'NGN', '₦', 1600, 10000, 0, true, 'manual', NOW(), NOW()),
  (gen_random_uuid(), 'PK', 'Pakistan', 'PKR', '₨', 278, 10000, 0, true, 'manual', NOW(), NOW()),
  (gen_random_uuid(), 'PH', 'Philippines', 'PHP', '₱', 56, 10000, 0, true, 'manual', NOW(), NOW()),
  (gen_random_uuid(), 'ZA', 'South Africa', 'ZAR', 'R', 18.5, 10000, 0, true, 'manual', NOW(), NOW()),
  (gen_random_uuid(), 'VN', 'Vietnam', 'VND', '₫', 25300, 10000, 0, true, 'manual', NOW(), NOW()),
  (gen_random_uuid(), 'BD', 'Bangladesh', 'BDT', '৳', 110, 10000, 0, true, 'manual', NOW(), NOW()),
  (gen_random_uuid(), 'US', 'United States', 'USD', '$', 1, 10000, 0, true, 'manual', NOW(), NOW()),
  (gen_random_uuid(), 'ET', 'Ethiopia', 'ETB', 'Br', 56, 10000, 0, true, 'manual', NOW(), NOW()),
  (gen_random_uuid(), 'GH', 'Ghana', 'GHS', '₵', 15.5, 10000, 0, true, 'manual', NOW(), NOW()),
  (gen_random_uuid(), 'IT', 'Italy', 'EUR', '€', 0.92, 10000, 0, true, 'manual', NOW(), NOW())
ON CONFLICT ("countryCode") DO UPDATE SET
  "isActive" = true,
  "countryName" = EXCLUDED."countryName",
  "currency" = EXCLUDED."currency",
  "symbol" = EXCLUDED."symbol";
