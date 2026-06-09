-- CreateTable
CREATE TABLE "room_music_tracks" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_music_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_music_tracks_roomId_position_idx" ON "room_music_tracks"("roomId", "position");

-- AddForeignKey
ALTER TABLE "room_music_tracks" ADD CONSTRAINT "room_music_tracks_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing bgMusicUrl values into room_music_tracks before dropping the column
INSERT INTO "room_music_tracks" ("id", "roomId", "name", "url", "position", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  "id",
  COALESCE(NULLIF(split_part(regexp_replace("bgMusicUrl", '\?.*$', ''), '/', array_length(regexp_split_to_array(regexp_replace("bgMusicUrl", '\?.*$', ''), '/'), 1)), ''), 'Untitled'),
  "bgMusicUrl",
  1,
  now(),
  now()
FROM "rooms"
WHERE "bgMusicUrl" IS NOT NULL AND "bgMusicUrl" != '';

-- AlterTable: remove bgMusicUrl
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "bgMusicUrl";
