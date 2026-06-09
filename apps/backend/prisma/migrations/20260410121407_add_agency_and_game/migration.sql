-- CreateTable
CREATE TABLE "agencies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "hostRevenueShare" DECIMAL(65,30) NOT NULL DEFAULT 0.70,
    "agentRevenueShare" DECIMAL(65,30) NOT NULL DEFAULT 0.20,
    "companyShare" DECIMAL(65,30) NOT NULL DEFAULT 0.10,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_agency_assignments" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_agency_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "apiEndpoint" TEXT NOT NULL DEFAULT '',
    "apiKey" TEXT NOT NULL DEFAULT '',
    "rtpPercent" DECIMAL(65,30) NOT NULL DEFAULT 95.00,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totalRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalBets" INTEGER NOT NULL DEFAULT 0,
    "lastPingAt" TIMESTAMP(3),
    "lastPingOk" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agencies_ownerId_key" ON "agencies"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_agency_assignments_agencyId_adminId_key" ON "admin_agency_assignments"("agencyId", "adminId");

-- AddForeignKey
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_agency_assignments" ADD CONSTRAINT "admin_agency_assignments_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_agency_assignments" ADD CONSTRAINT "admin_agency_assignments_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
