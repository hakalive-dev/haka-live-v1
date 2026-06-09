import { musicApi } from '@api/music';
import { roomsApi } from '@api/rooms';
import type { CurrentMusicTrack, MusicQueue, RoomMusicTrack } from '@/types';

export function toCurrentMusicTrack(
  queued: RoomMusicTrack & { index?: number; total?: number },
  queue: MusicQueue,
): CurrentMusicTrack {
  return {
    url: queued.url,
    name: queued.name,
    trackId: queued.id,
    index: queued.index ?? queue.currentIndex,
    total: queued.total ?? queue.tracks.length,
  };
}

export type BootstrapRoomMusicResult = {
  played: CurrentMusicTrack;
  queue: MusicQueue;
};

/**
 * If the room queue is empty, enqueue the user's newest library track and return it as playing.
 * If the queue already has tracks, returns the current track without adding.
 */
export async function bootstrapRoomMusicFromLibrary(
  roomId: string,
): Promise<BootstrapRoomMusicResult | null> {
  const queue = await roomsApi.getMusicQueue(roomId);
  if (queue.tracks.length > 0) {
    const t = queue.tracks[queue.currentIndex];
    if (!t) return null;
    return {
      played: {
        url: t.url,
        name: t.name,
        trackId: t.id,
        index: queue.currentIndex,
        total: queue.tracks.length,
      },
      queue,
    };
  }

  const library = await musicApi.getLibrary();
  if (library.tracks.length === 0) return null;

  const { track: queued, queue: updatedQueue } = await roomsApi.addMusicFromLibrary(
    roomId,
    library.tracks[0].id,
    { playNow: true },
  );

  return {
    played: toCurrentMusicTrack(queued, updatedQueue),
    queue: updatedQueue,
  };
}
