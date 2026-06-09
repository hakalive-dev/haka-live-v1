-- Index on users.agentId for sumRollingAgencyTurnoverCoins subquery performance.
-- The query filters users WHERE agentId = X AND role = 'host' AND hostType = 'agent_host'
-- on every coin seller profile load; without an index this is a full table scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_agentId_idx" ON "users"("agentId");
