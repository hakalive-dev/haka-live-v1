import { redis } from '../../config/redis';

const ACTIVE_ROOM_TTL_SEC = 86400; // 24h — aligned with viewer set TTL

export function userActiveRoomKey(userId: string): string {
  return `user:${userId}:activeRoom`;
}

export async function setUserActiveRoom(userId: string, roomId: string): Promise<void> {
  await redis.set(userActiveRoomKey(userId), roomId, 'EX', ACTIVE_ROOM_TTL_SEC);
}

/** Clears only when stored room matches (or when roomId omitted). */
export async function clearUserActiveRoom(userId: string, roomId?: string): Promise<void> {
  const key = userActiveRoomKey(userId);
  if (roomId) {
    const current = await redis.get(key);
    if (current !== roomId) return;
  }
  await redis.del(key);
}

export async function getUserActiveRoomId(userId: string): Promise<string | null> {
  const raw = await redis.get(userActiveRoomKey(userId));
  return raw && raw.length > 0 ? raw : null;
}
