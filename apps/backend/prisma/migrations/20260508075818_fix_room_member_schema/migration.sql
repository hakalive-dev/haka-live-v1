-- Fix RoomMember schema issues:
-- 1. id column: change default generator from cuid() to uuid() (Prisma-level only; column type TEXT unchanged)
-- 2. Add @relation names "RoomMemberships" and "RoomMembers" (Prisma-level only; no SQL required)
-- 3. Add @@index([userId]) for efficient "rooms a user is a member of" queries

-- CreateIndex
CREATE INDEX IF NOT EXISTS "room_members_userId_idx" ON "room_members"("userId");
