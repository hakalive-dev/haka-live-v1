-- AlterTable
ALTER TABLE "withdrawal_requests" ADD COLUMN "orderId" TEXT NOT NULL DEFAULT '';

-- Backfill unique 12-digit order IDs for existing rows
DO $$
DECLARE
  r RECORD;
  new_id TEXT;
  attempts INT;
BEGIN
  FOR r IN SELECT id FROM withdrawal_requests WHERE "orderId" = '' LOOP
    attempts := 0;
    LOOP
      new_id := (100000000000 + floor(random() * 900000000000))::bigint::text;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM withdrawal_requests WHERE "orderId" = new_id);
      attempts := attempts + 1;
      IF attempts > 50 THEN
        RAISE EXCEPTION 'withdrawal orderId backfill failed for row %', r.id;
      END IF;
    END LOOP;
    UPDATE withdrawal_requests SET "orderId" = new_id WHERE id = r.id;
  END LOOP;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_requests_orderId_key" ON "withdrawal_requests"("orderId");
