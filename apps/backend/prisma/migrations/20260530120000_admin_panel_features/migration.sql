-- ──────────────────────────────────────────────────────────────────────────────
-- Admin panel features: Room Pin, Ban proof/result, User task-ban flag
-- ──────────────────────────────────────────────────────────────────────────────

-- User: host-task ban flag (admin can block a host from claiming task rewards)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isTaskBanned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isTaskBannedReason" TEXT NOT NULL DEFAULT '';

-- Ban: proof URL + outcome result fields
ALTER TABLE "bans" ADD COLUMN IF NOT EXISTS "proofUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "bans" ADD COLUMN IF NOT EXISTS "result" TEXT NOT NULL DEFAULT '';

-- Room Pin: pin a room to the top of discovery listing for a limited time
CREATE TABLE IF NOT EXISTS "room_pins" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "pinnedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_pins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "room_pins_roomId_key" ON "room_pins"("roomId");
CREATE INDEX IF NOT EXISTS "room_pins_expiresAt_idx" ON "room_pins"("expiresAt");

ALTER TABLE "room_pins" ADD CONSTRAINT "room_pins_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
