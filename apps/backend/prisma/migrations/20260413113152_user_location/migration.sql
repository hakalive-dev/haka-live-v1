-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locationLat" DOUBLE PRECISION,
ADD COLUMN     "locationLng" DOUBLE PRECISION,
ADD COLUMN     "locationUpdatedAt" TIMESTAMP(3);
