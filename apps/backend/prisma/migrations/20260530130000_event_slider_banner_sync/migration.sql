-- Link auto-managed home slider banners to their source event.
ALTER TABLE "banners" ADD COLUMN "eventId" TEXT;

CREATE UNIQUE INDEX "banners_eventId_key" ON "banners"("eventId");

ALTER TABLE "banners"
  ADD CONSTRAINT "banners_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
