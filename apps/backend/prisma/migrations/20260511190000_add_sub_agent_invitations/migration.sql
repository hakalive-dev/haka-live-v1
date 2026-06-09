-- CreateTable
CREATE TABLE "sub_agent_invitations" (
    "id" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "proposedAgencyName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_agent_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sub_agent_invitations_inviteeId_status_idx" ON "sub_agent_invitations"("inviteeId", "status");

-- CreateIndex
CREATE INDEX "sub_agent_invitations_inviterId_status_idx" ON "sub_agent_invitations"("inviterId", "status");

-- AddForeignKey
ALTER TABLE "sub_agent_invitations" ADD CONSTRAINT "sub_agent_invitations_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_agent_invitations" ADD CONSTRAINT "sub_agent_invitations_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
