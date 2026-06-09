-- Performance indexes for high-frequency queries.
--
-- follows.actorId    — Following-tab query filters WHERE actorId = X; without
--                      an index this is a full-table scan on every tab switch.
-- rooms.(status,type) — Every live room list query filters WHERE status='live';
--                       composite with type covers public/private splits.
-- rooms.hostId       — Host-filtered room queries (profile screen, agency roster).
-- host_mic_sessions.(userId,roomId,startedAt)
--                    — Room stats date-range query joins on userId AND roomId;
--                      the existing (userId,startedAt) index is skipped when
--                      roomId is also in the WHERE clause.

CREATE INDEX IF NOT EXISTS "follows_actorId_idx"
  ON "follows"("actorId");

CREATE INDEX IF NOT EXISTS "rooms_status_type_idx"
  ON "rooms"("status", "type");

CREATE INDEX IF NOT EXISTS "rooms_hostId_idx"
  ON "rooms"("hostId");

CREATE INDEX IF NOT EXISTS "host_mic_sessions_userId_roomId_startedAt_idx"
  ON "host_mic_sessions"("userId", "roomId", "startedAt");
