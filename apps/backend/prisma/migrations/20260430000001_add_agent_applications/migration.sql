-- Create agent_applications table for users applying to become an agent/agency owner.
-- Admin reviews and either approves (creates agency + promotes user) or rejects.

CREATE TABLE "agent_applications" (
  "id"            TEXT        NOT NULL,
  "userId"        TEXT        NOT NULL,
  "proposedName"  TEXT        NOT NULL,
  "country"       TEXT        NOT NULL DEFAULT '',
  "parentAgentId" TEXT,
  "status"        TEXT        NOT NULL DEFAULT 'pending',
  "note"          TEXT        NOT NULL DEFAULT '',
  "reviewedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_applications_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agent_applications"
  ADD CONSTRAINT "agent_applications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_applications"
  ADD CONSTRAINT "agent_applications_parentAgentId_fkey"
  FOREIGN KEY ("parentAgentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "agent_applications_userId_status_idx" ON "agent_applications"("userId", "status");
