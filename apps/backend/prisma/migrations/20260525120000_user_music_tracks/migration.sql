-- CreateTable
CREATE TABLE "user_music_tracks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_music_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_music_tracks_userId_idx" ON "user_music_tracks"("userId");

-- AddForeignKey
ALTER TABLE "user_music_tracks" ADD CONSTRAINT "user_music_tracks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
