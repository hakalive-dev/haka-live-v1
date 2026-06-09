-- Make agencyId nullable in gift_commission_ledger to support company_share rows
-- (company_share rows have no agencyId — they represent platform revenue)

ALTER TABLE gift_commission_ledger ALTER COLUMN "agencyId" DROP NOT NULL;
