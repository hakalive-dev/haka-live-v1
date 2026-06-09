-- Female Host Task: gate live-room mic time behind an admin switch.
-- Default false → only chat-room mic time counts until live sessions launch.
ALTER TABLE "host_level_task_settings"
  ADD COLUMN "countLiveMicTime" BOOLEAN NOT NULL DEFAULT false;
