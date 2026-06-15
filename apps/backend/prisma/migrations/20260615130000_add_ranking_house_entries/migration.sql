-- CreateTable
CREATE TABLE "ranking_house_entries" (
    "id" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "income" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ranking_house_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ranking_house_entries_board_active_idx" ON "ranking_house_entries"("board", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_house_entries_board_userId_key" ON "ranking_house_entries"("board", "userId");

-- AddForeignKey
ALTER TABLE "ranking_house_entries" ADD CONSTRAINT "ranking_house_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
