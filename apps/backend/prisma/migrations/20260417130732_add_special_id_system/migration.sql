-- AlterTable
ALTER TABLE "users" ADD COLUMN     "activeSpecialId" TEXT,
ADD COLUMN     "activeSpecialIdExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "special_ids" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "special_ids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "special_id_inventory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "specialIdId" TEXT NOT NULL,
    "pricePaid" INTEGER NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "special_id_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "special_ids_number_key" ON "special_ids"("number");

-- CreateIndex
CREATE INDEX "special_ids_status_level_idx" ON "special_ids"("status", "level");

-- CreateIndex
CREATE UNIQUE INDEX "special_id_inventory_specialIdId_key" ON "special_id_inventory"("specialIdId");

-- CreateIndex
CREATE INDEX "special_id_inventory_userId_status_idx" ON "special_id_inventory"("userId", "status");

-- AddForeignKey
ALTER TABLE "special_id_inventory" ADD CONSTRAINT "special_id_inventory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "special_id_inventory" ADD CONSTRAINT "special_id_inventory_specialIdId_fkey" FOREIGN KEY ("specialIdId") REFERENCES "special_ids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
