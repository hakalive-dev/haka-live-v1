-- Make RoomMessage.senderId nullable so system messages (seat apply notices,
-- chat-lock events, etc.) can be stored without a user sender.
-- Existing rows keep their current senderId unchanged.

ALTER TABLE "room_messages"
  ALTER COLUMN "senderId" DROP NOT NULL;

-- Change the FK action from CASCADE to SET NULL so deleting a user does not
-- cascade-delete all system messages that now have senderId = NULL.
ALTER TABLE "room_messages"
  DROP CONSTRAINT IF EXISTS "room_messages_senderId_fkey";

ALTER TABLE "room_messages"
  ADD CONSTRAINT "room_messages_senderId_fkey"
  FOREIGN KEY ("senderId")
  REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
