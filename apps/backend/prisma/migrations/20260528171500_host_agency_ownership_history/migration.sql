-- CreateTable
CREATE TABLE "host_agency_ownership_changes" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "fromAgentId" TEXT,
    "toAgentId" TEXT,
    "changedByAdminId" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "host_agency_ownership_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "host_agency_ownership_changes_hostId_createdAt_idx" ON "host_agency_ownership_changes"("hostId", "createdAt");

-- CreateIndex
CREATE INDEX "host_agency_ownership_changes_fromAgentId_createdAt_idx" ON "host_agency_ownership_changes"("fromAgentId", "createdAt");

-- CreateIndex
CREATE INDEX "host_agency_ownership_changes_toAgentId_createdAt_idx" ON "host_agency_ownership_changes"("toAgentId", "createdAt");

-- CreateIndex
CREATE INDEX "host_agency_ownership_changes_changedByAdminId_createdAt_idx" ON "host_agency_ownership_changes"("changedByAdminId", "createdAt");

-- AddForeignKey
ALTER TABLE "host_agency_ownership_changes" ADD CONSTRAINT "host_agency_ownership_changes_hostId_fkey"
FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_agency_ownership_changes" ADD CONSTRAINT "host_agency_ownership_changes_fromAgentId_fkey"
FOREIGN KEY ("fromAgentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_agency_ownership_changes" ADD CONSTRAINT "host_agency_ownership_changes_toAgentId_fkey"
FOREIGN KEY ("toAgentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_agency_ownership_changes" ADD CONSTRAINT "host_agency_ownership_changes_changedByAdminId_fkey"
FOREIGN KEY ("changedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

