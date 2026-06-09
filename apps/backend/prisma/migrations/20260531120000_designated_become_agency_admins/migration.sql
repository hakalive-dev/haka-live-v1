-- AlterTable
ALTER TABLE "agent_applications" ADD COLUMN "designatedAdminId" TEXT;

-- CreateTable
CREATE TABLE "designated_become_agency_admins" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designated_become_agency_admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "designated_become_agency_admins_adminId_key" ON "designated_become_agency_admins"("adminId");

-- CreateIndex
CREATE INDEX "designated_become_agency_admins_isActive_sortOrder_idx" ON "designated_become_agency_admins"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "agent_applications_designatedAdminId_idx" ON "agent_applications"("designatedAdminId");

-- AddForeignKey
ALTER TABLE "agent_applications" ADD CONSTRAINT "agent_applications_designatedAdminId_fkey" FOREIGN KEY ("designatedAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designated_become_agency_admins" ADD CONSTRAINT "designated_become_agency_admins_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
