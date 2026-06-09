-- Level task: mic room mode, PK presence, claim idempotency
ALTER TABLE "host_mic_sessions" ADD COLUMN IF NOT EXISTS "roomMode" TEXT NOT NULL DEFAULT 'chat';

CREATE TABLE "host_pk_presence_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pkMatchId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_pk_presence_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "host_pk_presence_sessions_userId_startedAt_idx" ON "host_pk_presence_sessions"("userId", "startedAt");
CREATE INDEX "host_pk_presence_sessions_pkMatchId_idx" ON "host_pk_presence_sessions"("pkMatchId");

ALTER TABLE "host_pk_presence_sessions" ADD CONSTRAINT "host_pk_presence_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "host_level_task_claims" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskDate" DATE NOT NULL,
    "claimType" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "beansAwarded" INTEGER NOT NULL DEFAULT 0,
    "jobId" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_level_task_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "host_level_task_claims_jobId_key" ON "host_level_task_claims"("jobId");
CREATE UNIQUE INDEX "host_level_task_claims_userId_taskDate_claimType_sequence_key" ON "host_level_task_claims"("userId", "taskDate", "claimType", "sequence");
CREATE INDEX "host_level_task_claims_userId_status_idx" ON "host_level_task_claims"("userId", "status");

ALTER TABLE "host_level_task_claims" ADD CONSTRAINT "host_level_task_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
